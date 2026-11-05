import type Anthropic from "@anthropic-ai/sdk";
import { todayInTimezone } from "@/src/domain/datetime";
import * as z from "zod";
import { and, count, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import {
  accounts as accountsTable,
  categories as categoriesTable,
  transactions as txTable,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { MODELS, anthropic, errorCodeOf, toAiError, usageFrom } from "./client";
import { recordUsage } from "./usage";
import * as analyticsService from "@/src/server/services/analytics-service";
import * as budgetService from "@/src/server/services/budget-service";
import * as subscriptionService from "@/src/server/services/subscription-service";
import * as categoryService from "@/src/server/services/category-service";

/**
 * Non-conversational AI features.
 *
 * Each one has a narrow job, a structured output, and a deterministic fallback
 * for when the model is unavailable — the ledger must keep working when the
 * assistant does not. Cheap, high-volume work runs on Haiku; anything that
 * reads a whole month runs on Sonnet.
 */

/* ---------------------------------------------------------- structured JSON */

/**
 * Ask for JSON matching a schema, validate it, and return null rather than
 * guessing when it doesn't match. A model that returns the wrong shape is a
 * failed call, not a reason to coerce.
 */
async function askForJson<T>(
  userId: string,
  options: {
    feature: Parameters<typeof recordUsage>[1]["feature"];
    model: string;
    system: string;
    messages: Anthropic.MessageParam[];
    schema: z.ZodType<T>;
    outputSchema: Record<string, unknown>;
    maxTokens?: number;
    db?: Db;
  },
): Promise<T | null> {
  const started = Date.now();
  try {
    const response = await anthropic().messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 2000,
      system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
      messages: options.messages,
      output_config: {
        format: {
          type: "json_schema",
          schema: options.outputSchema as never,
        },
      },
    });

    const usage = usageFrom(response.usage);
    await recordUsage(userId, {
      feature: options.feature,
      model: options.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs: Date.now() - started,
      success: response.stop_reason !== "refusal",
    }, options.db);

    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text.trim()) return null;

    const parsed = options.schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    await recordUsage(userId, {
      feature: options.feature,
      model: options.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorCode: errorCodeOf(error),
    }, options.db);
    throw toAiError(error);
  }
}

/* ══════════════════════════════════════════════════════════ CATEGORISE ══ */

const categoriseSchema = z.object({
  results: z.array(
    z.object({
      transactionId: z.string(),
      categorySlug: z.string(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(120).optional(),
    }),
  ),
});

export interface CategorisationResult {
  transactionId: string;
  categoryId: string;
  categoryName: string;
  confidence: number;
  reason?: string;
  source: "history" | "merchant" | "ai";
}

const AI_CONFIDENCE_FLOOR = 0.6;

/**
 * Categorise uncategorised transactions.
 *
 * Deterministic passes run first and usually win: if this merchant has a
 * default category, or the user has categorised it the same way before, that is
 * a better answer than anything a model can infer, and it costs nothing.
 * The model only sees what is left.
 */
export async function categoriseTransactions(
  actor: ActorContext,
  transactionIds: string[],
  db: Db = rootDb,
): Promise<CategorisationResult[]> {
  const transactions = await db.query.transactions.findMany({
    where: and(
      inArray(txTable.id, transactionIds),
      eq(txTable.userId, actor.userId),
      isNull(txTable.deletedAt),
    ),
    columns: {
      id: true,
      description: true,
      rawDescriptor: true,
      amountMinor: true,
      currency: true,
      occurredAt: true,
      type: true,
      merchantId: true,
    },
    with: { merchant: { columns: { id: true, name: true, defaultCategoryId: true } } },
  });
  if (transactions.length === 0) return [];

  const categories = await categoryService.flat(actor, {});
  const byId = new Map(categories.map((c) => [c.id, c]));
  const results: CategorisationResult[] = [];
  const unresolved: typeof transactions = [];

  for (const txn of transactions) {
    // Pass 1 — the merchant's own default.
    if (txn.merchant?.defaultCategoryId && byId.has(txn.merchant.defaultCategoryId)) {
      const category = byId.get(txn.merchant.defaultCategoryId)!;
      results.push({
        transactionId: txn.id,
        categoryId: category.id,
        categoryName: category.name,
        confidence: 0.97,
        reason: `${txn.merchant.name} is always ${category.name}`,
        source: "merchant",
      });
      continue;
    }

    // Pass 2 — what this user chose for this merchant before.
    if (txn.merchantId) {
      // The category this merchant is usually filed under, excluding the row
      // being categorised so it cannot vote for itself.
      const prior = await db
        .select({ categoryId: txTable.categoryId, _count: { categoryId: count() } })
        .from(txTable)
        .where(
          and(
            eq(txTable.userId, actor.userId),
            eq(txTable.merchantId, txn.merchantId),
            isNotNull(txTable.categoryId),
            isNull(txTable.deletedAt),
            ne(txTable.id, txn.id),
          ),
        )
        .groupBy(txTable.categoryId)
        .orderBy(desc(count()))
        .limit(1);
      const top = prior[0];
      if (top?.categoryId && top._count.categoryId >= 2 && byId.has(top.categoryId)) {
        const category = byId.get(top.categoryId)!;
        results.push({
          transactionId: txn.id,
          categoryId: category.id,
          categoryName: category.name,
          confidence: Math.min(0.95, 0.7 + top._count.categoryId * 0.05),
          reason: `You've categorised ${txn.merchant?.name ?? "this"} as ${category.name} ${top._count.categoryId} times`,
          source: "history",
        });
        continue;
      }
    }

    unresolved.push(txn);
  }

  if (unresolved.length === 0) return results;

  const slugs = await db.query.categories.findMany({
    where: and(eq(categoriesTable.userId, actor.userId), isNull(categoriesTable.archivedAt)),
    columns: { id: true, slug: true, name: true, kind: true },
    with: { category: { columns: { name: true } } },
  });
  const bySlug = new Map(slugs.map((c) => [c.slug, c]));

  const catalogue = slugs
    .map((c) => `${c.slug} — ${c.category ? `${c.category.name} › ` : ""}${c.name} (${c.kind})`)
    .join("\n");

  const payload = unresolved.map((t) => ({
    id: t.id,
    description: t.description ?? t.rawDescriptor ?? "",
    merchant: t.merchant?.name ?? null,
    amount: (Number(t.amountMinor) / 100).toFixed(2),
    currency: t.currency,
    date: t.occurredAt.toISOString().slice(0, 10),
    type: t.type,
  }));

  const parsed = await askForJson(actor.userId, {
    feature: "CATEGORISE",
    model: MODELS.fast,
    db,
    maxTokens: 3000,
    system: `You categorise bank transactions into a fixed set of categories.

Available categories, one per line as "slug — path (kind)":
${catalogue}

Rules:
- Return one result per input transaction, using the exact slug.
- Confidence is your honest estimate from 0 to 1. Below 0.6 means "I'm guessing" —
  those are surfaced for the person to decide, so an honest low score is more useful
  than a confident wrong one.
- Match the category kind to the transaction type: INCOME transactions get INCOME categories.
- A reason is one short phrase, not a sentence.`,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    schema: categoriseSchema,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["transactionId", "categorySlug", "confidence"],
            properties: {
              transactionId: { type: "string" },
              categorySlug: { type: "string" },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  });

  for (const row of parsed?.results ?? []) {
    const category = bySlug.get(row.categorySlug);
    // A slug the model invented resolves to nothing, and is dropped.
    if (!category) continue;
    if (!unresolved.some((t) => t.id === row.transactionId)) continue;
    if (row.confidence < AI_CONFIDENCE_FLOOR) continue;

    results.push({
      transactionId: row.transactionId,
      categoryId: category.id,
      categoryName: category.name,
      confidence: row.confidence,
      reason: row.reason,
      source: "ai",
    });
  }

  return results;
}

/** Apply categorisations above a confidence floor; flag the rest for review. */
export async function applyCategorisations(
  actor: ActorContext,
  results: CategorisationResult[],
  options: { autoApplyAbove?: number } = {},
  db: Db = rootDb,
): Promise<{ applied: number; flagged: number }> {
  const floor = options.autoApplyAbove ?? 0.8;
  const confident = results.filter((r) => r.confidence >= floor);
  const uncertain = results.filter((r) => r.confidence < floor);

  for (const row of confident) {
    await db
      .update(txTable)
      .set({ categoryId: row.categoryId })
      .where(
        and(
          eq(txTable.id, row.transactionId),
          eq(txTable.userId, actor.userId),
          isNull(txTable.categoryId),
        ),
      );
  }

  if (uncertain.length > 0) {
    await db
      .update(txTable)
      .set({ needsReview: true })
      .where(
        and(
          inArray(
            txTable.id,
            uncertain.map((u) => u.transactionId),
          ),
          eq(txTable.userId, actor.userId),
        ),
      );
  }

  return { applied: confident.length, flagged: uncertain.length };
}

/* ═════════════════════════════════════════════════════ RECEIPT EXTRACT ══ */

const receiptSchema = z.object({
  merchantName: z.string().nullable(),
  total: z.string().nullable(),
  tax: z.string().nullable(),
  tip: z.string().nullable(),
  currency: z.string().nullable(),
  purchasedAt: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  lineItems: z
    .array(z.object({ description: z.string(), quantity: z.number().nullable(), total: z.string() }))
    .max(80)
    .default([]),
});

export type ReceiptExtraction = z.infer<typeof receiptSchema>;

/**
 * Read a receipt image or PDF.
 *
 * Confidence below 0.5 is returned as-is and surfaced for manual entry rather
 * than written to a transaction — a wrong total silently entered is worse than
 * no total at all.
 */
export async function extractReceipt(
  userId: string,
  file: { base64: string; mediaType: string },
  db: Db = rootDb,
): Promise<ReceiptExtraction | null> {
  const isPdf = file.mediaType === "application/pdf";
  const content: Anthropic.ContentBlockParam[] = [
    isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: file.base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: file.mediaType as never, data: file.base64 },
        },
    {
      type: "text",
      text: "Extract the receipt details. If a field is genuinely not on the receipt, use null rather than guessing.",
    },
  ];

  return askForJson(userId, {
    feature: "RECEIPT_EXTRACT",
    model: MODELS.chat,
    db,
    maxTokens: 3000,
    system: `You read receipts and return structured data.

- Amounts are decimal strings in major units, e.g. "64.20". No currency symbols.
- The total is what was actually charged, including tax and tip.
- purchasedAt is ISO 8601 with time when the receipt shows one, otherwise just the date.
- confidence reflects how legible the receipt is and how sure you are of the total.
  A blurry or partial scan should score low — the person will be asked to type it in,
  which is the right outcome.
- Do not invent line items that are not printed on the receipt.`,
    messages: [{ role: "user", content }],
    schema: receiptSchema,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["merchantName", "total", "tax", "tip", "currency", "purchasedAt", "confidence", "lineItems"],
      properties: {
        merchantName: { type: ["string", "null"] },
        total: { type: ["string", "null"] },
        tax: { type: ["string", "null"] },
        tip: { type: ["string", "null"] },
        currency: { type: ["string", "null"] },
        purchasedAt: { type: ["string", "null"] },
        confidence: { type: "number" },
        lineItems: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["description", "quantity", "total"],
            properties: {
              description: { type: "string" },
              quantity: { type: ["number", "null"] },
              total: { type: "string" },
            },
          },
        },
      },
    },
  });
}

/* ════════════════════════════════════════════════════════ WEEKLY BRIEF ══ */

const briefSchema = z.object({
  headline: z.string().max(200),
  body: z.string().max(1200),
  suggestions: z.array(z.object({ label: z.string().max(60), action: z.string().max(40) })).max(4).default([]),
});

export type Brief = z.infer<typeof briefSchema>;

/**
 * The weekly brief.
 *
 * Every figure in the prompt is computed by the database first; the model's job
 * is to pick which two matter and write one paragraph about them. It is given
 * the numbers, and told explicitly not to produce new ones.
 */
export async function generateBrief(actor: ActorContext, db: Db = rootDb): Promise<Brief | null> {
  const [overview, budgets, subs, anomalies] = await Promise.all([
    analyticsService.overview(actor, { period: "MONTHLY" }, db),
    budgetService.list(actor, {}, db),
    subscriptionService.summary(actor, db),
    analyticsService.detectAnomalies(actor, { sinceDays: 7 }, db),
  ]);

  const overBudget = budgets.flatMap((b) =>
    b.lines
      .filter((l) => l.health === "OVER" || l.health === "AT_RISK")
      .map((l) => ({
        budget: b.name,
        category: l.categoryName,
        spent: l.spent.decimal,
        limit: l.effectiveLimit.decimal,
        health: l.health,
        periodElapsedPercent: Math.round(b.elapsedFraction * 100),
        usedPercent: Math.round(l.usedFraction * 100),
      })),
  );

  const facts = {
    currency: actor.baseCurrency,
    period: overview.range.label,
    income: overview.income.decimal,
    spending: overview.spending.decimal,
    net: overview.net.decimal,
    savingsRatePercent: Number((overview.savingsRate * 100).toFixed(1)),
    spendingChangePercent: Number((overview.changes.spending * 100).toFixed(1)),
    incomeChangePercent: Number((overview.changes.income * 100).toFixed(1)),
    netWorth: overview.netWorth.net.decimal,
    budgetsNeedingAttention: overBudget,
    subscriptions: {
      monthlyTotal: subs.monthlyTotal.decimal,
      unusedCount: subs.unusedCount,
      unusedAnnualCost: subs.unusedAnnualCost.decimal,
      trialsEndingSoon: subs.trialsEndingSoon.map((s) => ({
        name: s.name,
        endsOn: s.trialEndsOn?.slice(0, 10),
        thenCosts: s.price.decimal,
      })),
    },
    unusualTransactions: anomalies.slice(0, 3).map((a) => ({
      description: a.description,
      amount: a.amount.decimal,
      reason: a.reason,
    })),
  };

  return askForJson(actor.userId, {
    feature: "WEEKLY_BRIEF",
    model: MODELS.chat,
    db,
    maxTokens: 1500,
    system: `You write a short weekly financial brief for someone looking at their own money.

You are given exact figures. Use them verbatim — do not compute new ones, do not round
them differently, do not add up anything yourself. If a figure you want is not in the
data, leave it out.

- headline: one sentence, the single most useful thing this week. Specific, with a number.
- body: two or three sentences. Say what happened and what drove it. No preamble, no
  "great job", no advice the data does not support.
- suggestions: up to three actions, each a short label and an action key from:
  review_budget, review_subscriptions, review_transaction, set_budget, contribute_goal.
  Only suggest something the data actually points at.

Plain, direct language. No exclamation marks. Never say "let's" or "we".`,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
    schema: briefSchema,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "body", "suggestions"],
      properties: {
        headline: { type: "string" },
        body: { type: "string" },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "action"],
            properties: { label: { type: "string" }, action: { type: "string" } },
          },
        },
      },
    },
  });
}

/* ═════════════════════════════════════════════════ NATURAL LANGUAGE ADD ══ */

const parsedTransactionSchema = z.object({
  understood: z.boolean(),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).nullable(),
  amount: z.string().nullable(),
  merchant: z.string().nullable(),
  categorySlug: z.string().nullable(),
  accountHint: z.string().nullable(),
  date: z.string().nullable(),
  note: z.string().nullable(),
  clarification: z.string().nullable(),
});

export type ParsedTransaction = z.infer<typeof parsedTransactionSchema>;

/**
 * "12 quid lunch at Pret on the Amex yesterday" → structured fields.
 * Returns a draft for the quick-add sheet; nothing is saved here.
 */
export async function parseNaturalLanguageTransaction(
  actor: ActorContext,
  text: string,
  db: Db = rootDb,
): Promise<ParsedTransaction | null> {
  const [categories, accounts] = await Promise.all([
    db
      .select({ slug: categoriesTable.slug, name: categoriesTable.name })
      .from(categoriesTable)
      .where(
        and(eq(categoriesTable.userId, actor.userId), isNull(categoriesTable.archivedAt)),
      )
      .limit(200),
    db
      .select({ name: accountsTable.name })
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, actor.userId),
          isNull(accountsTable.deletedAt),
          isNull(accountsTable.archivedAt),
        ),
      ),
  ]);

  return askForJson(actor.userId, {
    feature: "CHAT",
    model: MODELS.fast,
    db,
    maxTokens: 800,
    system: `You turn a short phrase into the fields of a transaction.

Today is ${todayInTimezone(actor.timezone)}. Default currency ${actor.baseCurrency}.

Categories: ${categories.map((c) => c.slug).join(", ")}
Accounts: ${accounts.map((a) => a.name).join(", ")}

- amount is a decimal string in major units, no symbol.
- date is ISO yyyy-mm-dd. Resolve "yesterday", "last Friday" against today's date.
- accountHint is the account name as written by the user, if they named one.
- If the phrase is too vague to produce an amount, set understood to false and put one
  short question in clarification. Do not invent an amount.`,
    messages: [{ role: "user", content: text }],
    schema: parsedTransactionSchema,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["understood", "type", "amount", "merchant", "categorySlug", "accountHint", "date", "note", "clarification"],
      properties: {
        understood: { type: "boolean" },
        type: { type: ["string", "null"], enum: ["EXPENSE", "INCOME", "TRANSFER", null] },
        amount: { type: ["string", "null"] },
        merchant: { type: ["string", "null"] },
        categorySlug: { type: ["string", "null"] },
        accountHint: { type: ["string", "null"] },
        date: { type: ["string", "null"] },
        note: { type: ["string", "null"] },
        clarification: { type: ["string", "null"] },
      },
    },
  });
}

/* ═══════════════════════════════════════════════════ BUDGET SUGGESTIONS ══ */

const budgetSuggestionSchema = z.object({
  rationale: z.string().max(400),
  adjustments: z
    .array(
      z.object({
        categorySlug: z.string(),
        suggestedLimit: z.string(),
        reason: z.string().max(120),
      }),
    )
    .max(15),
});

/**
 * Propose budget limits.
 *
 * The *numbers* come from `budgetService.suggestFromHistory`, which takes the
 * median of the last three months. The model only reorders, drops the ones that
 * make no sense, and explains. It never produces a limit of its own.
 */
export async function suggestBudgets(actor: ActorContext, db: Db = rootDb) {
  const suggestions = await budgetService.suggestFromHistory(actor, { months: 3 });
  if (suggestions.length === 0) return { rationale: "", adjustments: [], computed: suggestions };

  const slugs = await db
    .select({ id: categoriesTable.id, slug: categoriesTable.slug })
    .from(categoriesTable)
    .where(
      and(
        inArray(
          categoriesTable.id,
          suggestions.map((s) => s.categoryId),
        ),
        // Scoped even though the ids came from our own suggestions: a slug for
        // someone else's category must never leak into a prompt.
        eq(categoriesTable.userId, actor.userId),
      ),
    );
  const slugById = new Map(slugs.map((s) => [s.id, s.slug]));

  const parsed = await askForJson(actor.userId, {
    feature: "BUDGET_SUGGEST",
    model: MODELS.chat,
    db,
    maxTokens: 1500,
    system: `You review computed budget suggestions and explain them.

Each row already contains a suggested limit, computed as the median of the last three
months of actual spending, rounded up. Do not change a suggested limit — copy it
exactly. Your job is to:
- drop rows that would not make a useful budget (one-off categories, tiny amounts)
- order what remains by how much it matters
- write one short reason per row, referring to the actual history

The rationale is two sentences at most.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          suggestions.map((s) => ({
            categorySlug: slugById.get(s.categoryId),
            categoryName: s.categoryName,
            suggestedLimit: s.suggested.decimal,
            monthlyHistory: s.history.map((h) => h.decimal),
          })),
        ),
      },
    ],
    schema: budgetSuggestionSchema,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["rationale", "adjustments"],
      properties: {
        rationale: { type: "string" },
        adjustments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["categorySlug", "suggestedLimit", "reason"],
            properties: {
              categorySlug: { type: "string" },
              suggestedLimit: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  });

  return { ...(parsed ?? { rationale: "", adjustments: [] }), computed: suggestions };
}
