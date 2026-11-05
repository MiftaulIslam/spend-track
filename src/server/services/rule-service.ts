import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  categories,
  financialRules,
  merchants,
  transactions,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as audit from "./audit-service";
import { createRuleSchema, ruleActionSchema, ruleConditionSchema } from "@/src/lib/schemas";
import type { CreateRuleInput } from "@/src/lib/schemas";
import { isoWeekday } from "@/src/domain/schedule";
import * as z from "zod";

/**
 * Automation rules.
 *
 * Rules run against a *draft* — before the transaction is written — so a rule
 * that sets a category produces one row with the right category rather than a
 * row plus an update. That keeps the audit log readable and halves the writes
 * on a bulk import.
 */

type Condition = z.infer<typeof ruleConditionSchema>;
type Action = z.infer<typeof ruleActionSchema>;

export interface TransactionDraft {
  categoryId: string | null;
  merchantId: string | null;
  note: string | null;
  needsReview: boolean;
  excludeFromBudget: boolean;
  tagNames: string[];
}

export interface RuleContext {
  draft: TransactionDraft;
  amountMinor: bigint;
  accountId: string;
  description: string | null;
  occurredAt: Date;
  merchantName?: string | null;
  mcc?: string | null;
  db?: Db;
}

/* --------------------------------------------------------------- matching */

function textMatches(operator: Condition["operator"], haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  switch (operator) {
    case "contains": return h.includes(n);
    case "equals": return h === n;
    case "starts_with": return h.startsWith(n);
    case "ends_with": return h.endsWith(n);
    case "regex":
      try {
        // A user-authored regex must not be able to hang the request. Node has
        // no regex timeout, so the pattern length is capped as a crude guard and
        // the match runs on a bounded string.
        if (needle.length > 200) return false;
        return new RegExp(needle, "i").test(haystack.slice(0, 500));
      } catch {
        return false;
      }
    default: return false;
  }
}

function numberMatches(operator: Condition["operator"], value: bigint, target: Condition["value"]): boolean {
  const toMinor = (v: unknown): bigint => {
    if (typeof v === "bigint") return v;
    const n = Number(v);
    return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : 0n;
  };

  if (operator === "between" && Array.isArray(target) && target.length === 2) {
    return value >= toMinor(target[0]) && value <= toMinor(target[1]);
  }
  const t = toMinor(Array.isArray(target) ? target[0] : target);
  switch (operator) {
    case "gt": return value > t;
    case "gte": return value >= t;
    case "lt": return value < t;
    case "lte": return value <= t;
    case "equals": return value === t;
    default: return false;
  }
}

function evaluateCondition(condition: Condition, ctx: RuleContext): boolean {
  const { field, operator, value } = condition;

  switch (field) {
    case "merchant":
      return textMatches(operator, ctx.merchantName ?? "", String(value));
    case "description":
      return textMatches(operator, ctx.description ?? "", String(value));
    case "amount":
      return numberMatches(operator, ctx.amountMinor, value);
    case "account":
      return operator === "in" && Array.isArray(value)
        ? value.map(String).includes(ctx.accountId)
        : ctx.accountId === String(value);
    case "category":
      return operator === "in" && Array.isArray(value)
        ? value.map(String).includes(ctx.draft.categoryId ?? "")
        : ctx.draft.categoryId === String(value);
    case "weekday": {
      const day = isoWeekday(ctx.occurredAt);
      return Array.isArray(value) ? value.map(Number).includes(day) : day === Number(value);
    }
    case "mcc":
      return textMatches(operator, ctx.mcc ?? "", String(value));
    default:
      return false;
  }
}

function matches(rule: { matchAll: boolean; conditions: Condition[] }, ctx: RuleContext): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.matchAll
    ? rule.conditions.every((c) => evaluateCondition(c, ctx))
    : rule.conditions.some((c) => evaluateCondition(c, ctx));
}

function applyAction(action: Action, draft: TransactionDraft): TransactionDraft {
  switch (action.action) {
    case "set_category":
      return { ...draft, categoryId: String(action.value ?? "") || draft.categoryId };
    case "set_merchant":
      return { ...draft, merchantId: String(action.value ?? "") || draft.merchantId };
    case "add_tag":
      return { ...draft, tagNames: [...new Set([...draft.tagNames, String(action.value ?? "")])].filter(Boolean) };
    case "flag_review":
      return { ...draft, needsReview: action.value !== false };
    case "exclude_from_budget":
      return { ...draft, excludeFromBudget: action.value !== false };
    case "set_note":
      return { ...draft, note: String(action.value ?? draft.note ?? "") };
    case "notify":
      // Notification is a side effect, handled by the caller from needsReview.
      return { ...draft, needsReview: true };
    default:
      return draft;
  }
}

/**
 * Apply every enabled rule, in priority order, to a draft.
 * Called from `transaction-service.create` before the insert.
 */
export async function applyRulesToDraft(
  actor: ActorContext,
  ctx: RuleContext,
): Promise<TransactionDraft> {
  const db = ctx.db ?? rootDb;

  const rules = await db
    .select({
      id: financialRules.id,
      matchAll: financialRules.matchAll,
      stopOnMatch: financialRules.stopOnMatch,
      conditions: financialRules.conditions,
      actions: financialRules.actions,
    })
    .from(financialRules)
    .where(
      and(
        eq(financialRules.userId, actor.userId),
        eq(financialRules.enabled, true),
        isNull(financialRules.deletedAt),
      ),
    )
    .orderBy(asc(financialRules.priority), asc(financialRules.createdAt));
  if (rules.length === 0) return ctx.draft;

  // Rules can match on the merchant's name, so resolve it once up front.
  let merchantName = ctx.merchantName ?? null;
  if (!merchantName && ctx.draft.merchantId) {
    const merchant = await db.query.merchants.findFirst({
      where: and(
        eq(merchants.id, ctx.draft.merchantId),
        eq(merchants.userId, actor.userId),
      ),
      columns: { name: true, mcc: true },
    });
    merchantName = merchant?.name ?? null;
    ctx.mcc = ctx.mcc ?? merchant?.mcc ?? null;
  }

  let draft = ctx.draft;
  const applied: string[] = [];

  for (const rule of rules) {
    const conditions = parseJsonArray(rule.conditions, ruleConditionSchema);
    const actions = parseJsonArray(rule.actions, ruleActionSchema);
    if (conditions.length === 0 || actions.length === 0) continue;

    if (!matches({ matchAll: rule.matchAll, conditions }, { ...ctx, draft, merchantName })) continue;

    for (const action of actions) draft = applyAction(action, draft);
    applied.push(rule.id);
    if (rule.stopOnMatch) break;
  }

  if (applied.length > 0) {
    await db
      .update(financialRules)
      .set({
        appliedCount: sql`${financialRules.appliedCount} + 1`,
        lastAppliedAt: new Date(),
      })
      .where(
        and(inArray(financialRules.id, applied), eq(financialRules.userId, actor.userId)),
      );
  }

  return draft;
}

function parseJsonArray<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/* ------------------------------------------------------------------- CRUD */

export async function list(actor: ActorContext) {
  const rows = await rootDb.query.financialRules.findMany({
    where: and(eq(financialRules.userId, actor.userId), isNull(financialRules.deletedAt)),
    orderBy: [asc(financialRules.priority), asc(financialRules.createdAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    priority: r.priority,
    matchAll: r.matchAll,
    stopOnMatch: r.stopOnMatch,
    conditions: parseJsonArray(r.conditions, ruleConditionSchema),
    actions: parseJsonArray(r.actions, ruleActionSchema),
    appliedCount: r.appliedCount,
    lastAppliedAt: r.lastAppliedAt?.toISOString() ?? null,
  }));
}

export async function create(actor: ActorContext, input: CreateRuleInput) {
  const parsed = createRuleSchema.parse(input);
  await assertReferencedIdsAreOwned(actor, parsed);

  const [rule] = await rootDb
    .insert(financialRules)
    .values({
      userId: actor.userId,
      name: parsed.name,
      enabled: parsed.enabled,
      priority: parsed.priority,
      matchAll: parsed.matchAll,
      stopOnMatch: parsed.stopOnMatch,
      conditions: parsed.conditions,
      actions: parsed.actions,
    })
    .returning();
  if (!rule) throw new NotFoundError("That rule");

  await audit.record(actor, { action: "rule.create", entityType: "FinancialRule", entityId: rule.id, after: rule });

  if (parsed.applyToHistory) {
    const result = await applyToHistory(actor, rule.id);
    return { ...rule, backfilled: result.updated };
  }
  return { ...rule, backfilled: 0 };
}

export async function update(actor: ActorContext, id: string, input: Partial<CreateRuleInput>) {
  const before = await rootDb.query.financialRules.findFirst({
    where: and(
      eq(financialRules.id, id),
      eq(financialRules.userId, actor.userId),
      isNull(financialRules.deletedAt),
    ),
  });
  if (!before) throw new NotFoundError("That rule");
  if (input.conditions || input.actions) {
    await assertReferencedIdsAreOwned(actor, input as CreateRuleInput);
  }

  const [after] = await rootDb
    .update(financialRules)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.matchAll !== undefined ? { matchAll: input.matchAll } : {}),
      ...(input.stopOnMatch !== undefined ? { stopOnMatch: input.stopOnMatch } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
      ...(input.actions !== undefined ? { actions: input.actions } : {}),
    })
    .where(and(eq(financialRules.id, id), eq(financialRules.userId, actor.userId)))
    .returning();

  await audit.record(actor, { action: "rule.update", entityType: "FinancialRule", entityId: id, before, after });
  return after;
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.financialRules.findFirst({
    where: and(
      eq(financialRules.id, id),
      eq(financialRules.userId, actor.userId),
      isNull(financialRules.deletedAt),
    ),
  });
  if (!before) throw new NotFoundError("That rule");
  await rootDb
    .update(financialRules)
    .set({ deletedAt: new Date() })
    .where(and(eq(financialRules.id, id), eq(financialRules.userId, actor.userId)));
  await audit.record(actor, { action: "rule.delete", entityType: "FinancialRule", entityId: id, before });
}

/** Category and merchant ids inside a rule are user data and must be owned. */
async function assertReferencedIdsAreOwned(actor: ActorContext, input: Partial<CreateRuleInput>): Promise<void> {
  const categoryIds = new Set<string>();
  const merchantIds = new Set<string>();

  for (const action of input.actions ?? []) {
    if (action.action === "set_category" && typeof action.value === "string") categoryIds.add(action.value);
    if (action.action === "set_merchant" && typeof action.value === "string") merchantIds.add(action.value);
  }
  for (const condition of input.conditions ?? []) {
    if (condition.field === "category") {
      const values = Array.isArray(condition.value) ? condition.value : [condition.value];
      for (const v of values) if (typeof v === "string") categoryIds.add(v);
    }
  }

  if (categoryIds.size > 0) {
    const [foundRow] = await rootDb
      .select({ n: count() })
      .from(categories)
      .where(
        and(inArray(categories.id, [...categoryIds]), eq(categories.userId, actor.userId)),
      );
    const found = foundRow?.n ?? 0;
    if (found !== categoryIds.size) throw new NotFoundError("One of those categories");
  }
  if (merchantIds.size > 0) {
    const [foundRow] = await rootDb
      .select({ n: count() })
      .from(merchants)
      .where(
        and(inArray(merchants.id, [...merchantIds]), eq(merchants.userId, actor.userId)),
      );
    const found = foundRow?.n ?? 0;
    if (found !== merchantIds.size) throw new NotFoundError("One of those merchants");
  }
}

/* --------------------------------------------------------- dry run & apply */

export interface DryRunResult {
  matched: number;
  wouldChange: number;
  samples: Array<{ id: string; description: string | null; currentCategory: string | null; newCategory: string | null }>;
}

/**
 * Report what a rule *would* do before it is saved.
 * "This matches 68 transactions and changes 51 of them" is the difference
 * between a rule a user trusts and one they are afraid to enable.
 */
export async function dryRun(
  actor: ActorContext,
  rule: Pick<CreateRuleInput, "conditions" | "actions" | "matchAll">,
  limit = 2000,
): Promise<DryRunResult> {
  const candidates = await rootDb.query.transactions.findMany({
    where: and(eq(transactions.userId, actor.userId), isNull(transactions.deletedAt)),
    orderBy: [desc(transactions.occurredAt)],
    limit,
    columns: {
      id: true,
      accountId: true,
      amountMinor: true,
      occurredAt: true,
      description: true,
      categoryId: true,
      merchantId: true,
      note: true,
      excludeFromBudget: true,
      needsReview: true,
    },
    with: {
      merchant: { columns: { name: true, mcc: true } },
      category: { columns: { name: true } },
    },
  });

  const categoryNames = new Map<string, string>();
  const targetCategoryId = rule.actions.find((a) => a.action === "set_category")?.value;
  if (typeof targetCategoryId === "string") {
    const c = await rootDb.query.categories.findFirst({
      where: and(eq(categories.id, targetCategoryId), eq(categories.userId, actor.userId)),
      columns: { id: true, name: true },
    });
    if (c) categoryNames.set(c.id, c.name);
  }

  let matched = 0;
  let wouldChange = 0;
  const samples: DryRunResult["samples"] = [];

  for (const txn of candidates) {
    const draft: TransactionDraft = {
      categoryId: txn.categoryId,
      merchantId: txn.merchantId,
      note: txn.note,
      needsReview: txn.needsReview,
      excludeFromBudget: txn.excludeFromBudget,
      tagNames: [],
    };
    const ctx: RuleContext = {
      draft,
      amountMinor: txn.amountMinor,
      accountId: txn.accountId,
      description: txn.description,
      occurredAt: txn.occurredAt,
      merchantName: txn.merchant?.name ?? null,
      mcc: txn.merchant?.mcc ?? null,
    };

    if (!matches({ matchAll: rule.matchAll ?? true, conditions: rule.conditions }, ctx)) continue;
    matched++;

    let next = draft;
    for (const action of rule.actions) next = applyAction(action, next);

    const changed =
      next.categoryId !== draft.categoryId ||
      next.merchantId !== draft.merchantId ||
      next.needsReview !== draft.needsReview ||
      next.excludeFromBudget !== draft.excludeFromBudget ||
      next.tagNames.length > 0;

    if (changed) {
      wouldChange++;
      if (samples.length < 10) {
        samples.push({
          id: txn.id,
          description: txn.description,
          currentCategory: txn.category?.name ?? null,
          newCategory: next.categoryId ? categoryNames.get(next.categoryId) ?? "—" : null,
        });
      }
    }
  }

  return { matched, wouldChange, samples };
}

/** Run a saved rule across existing transactions. */
export async function applyToHistory(
  actor: ActorContext,
  ruleId: string,
  limit = 5000,
): Promise<{ updated: number }> {
  const rule = await rootDb.query.financialRules.findFirst({
    where: and(
      eq(financialRules.id, ruleId),
      eq(financialRules.userId, actor.userId),
      isNull(financialRules.deletedAt),
    ),
  });
  if (!rule) throw new NotFoundError("That rule");

  const conditions = parseJsonArray(rule.conditions, ruleConditionSchema);
  const actions = parseJsonArray(rule.actions, ruleActionSchema);
  if (conditions.length === 0 || actions.length === 0) {
    throw new ValidationError("That rule has no conditions or no actions.");
  }

  const candidates = await rootDb.query.transactions.findMany({
    where: and(eq(transactions.userId, actor.userId), isNull(transactions.deletedAt)),
    orderBy: [desc(transactions.occurredAt)],
    limit,
    columns: {
      id: true,
      accountId: true,
      amountMinor: true,
      occurredAt: true,
      description: true,
      categoryId: true,
      merchantId: true,
      note: true,
      excludeFromBudget: true,
      needsReview: true,
    },
    with: { merchant: { columns: { name: true, mcc: true } } },
  });

  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const txn of candidates) {
    const draft: TransactionDraft = {
      categoryId: txn.categoryId,
      merchantId: txn.merchantId,
      note: txn.note,
      needsReview: txn.needsReview,
      excludeFromBudget: txn.excludeFromBudget,
      tagNames: [],
    };
    const ctx: RuleContext = {
      draft,
      amountMinor: txn.amountMinor,
      accountId: txn.accountId,
      description: txn.description,
      occurredAt: txn.occurredAt,
      merchantName: txn.merchant?.name ?? null,
      mcc: txn.merchant?.mcc ?? null,
    };
    if (!matches({ matchAll: rule.matchAll, conditions }, ctx)) continue;

    let next = draft;
    for (const action of actions) next = applyAction(action, next);

    const data: Record<string, unknown> = {};
    if (next.categoryId !== draft.categoryId) data.categoryId = next.categoryId;
    if (next.merchantId !== draft.merchantId) data.merchantId = next.merchantId;
    if (next.needsReview !== draft.needsReview) data.needsReview = next.needsReview;
    if (next.excludeFromBudget !== draft.excludeFromBudget) data.excludeFromBudget = next.excludeFromBudget;
    if (next.note !== draft.note) data.note = next.note;

    if (Object.keys(data).length > 0) updates.push({ id: txn.id, data });
  }

  if (updates.length === 0) return { updated: 0 };

  // Chunked so one enormous backfill cannot hold a transaction open for minutes.
  const CHUNK = 500;
  let updated = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    // One transaction per chunk, so a rule application is never half-applied
    // across a batch.
    await withTransaction(rootDb, async (tx) => {
      for (const u of chunk) {
        await tx
          .update(transactions)
          .set(u.data)
          .where(and(eq(transactions.id, u.id), eq(transactions.userId, actor.userId)));
      }
    });
    updated += chunk.length;
  }

  await rootDb
    .update(financialRules)
    .set({
      appliedCount: sql`${financialRules.appliedCount} + ${updated}`,
      lastAppliedAt: new Date(),
    })
    .where(
      and(eq(financialRules.id, ruleId), eq(financialRules.userId, actor.userId)),
    );

  await audit.record(actor, {
    action: "rule.apply_history",
    entityType: "FinancialRule",
    entityId: ruleId,
    after: { updated },
  });

  return { updated };
}
