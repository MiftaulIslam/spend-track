import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  budgetCategories,
  budgets,
  categories as categoriesTable,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError } from "@/src/server/errors";
import * as audit from "./audit-service";
import { money, toDTO, zero, type MoneyDTO } from "@/src/domain/money";
import { type PeriodKind, periodFor, previousPeriod } from "@/src/domain/schedule";
import {
  type BudgetHealth,
  computeRollover,
  crossedThresholds,
  evaluateLine,
  suggestLimit,
  summarise,
} from "@/src/domain/budget";
import { spendingByCategory } from "@/src/server/repositories/transaction-repository";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type { CreateBudgetInput } from "@/src/lib/schemas";
import * as z from "zod";
import type { updateBudgetSchema } from "@/src/lib/schemas";

/**
 * Budgets.
 *
 * Spend comes from a SQL aggregate over the *ledger*, filtered by the ledger
 * module's own idea of what counts as spending — so a transfer or a card
 * payment can never appear in a budget, and a refund reduces one. The arithmetic
 * is all in `src/domain/budget.ts`; this file is orchestration.
 */

/** What the schema default is; used when the column is null. */
const DEFAULT_ALERT_THRESHOLDS = [80, 100];

export interface BudgetLineDTO {
  categoryId: string;
  /** A lump-sum cost; the pace marker is hidden for these. */
  fixed: boolean;
  categoryName: string;
  colorIndex: number;
  icon: string;
  limit: MoneyDTO;
  effectiveLimit: MoneyDTO;
  rollover: MoneyDTO | null;
  spent: MoneyDTO;
  remaining: MoneyDTO;
  usedFraction: number;
  paceDelta: number;
  health: BudgetHealth;
  projected: MoneyDTO;
  projectedOverrun: MoneyDTO;
  transactionCount: number;
}

export interface BudgetDTO {
  id: string;
  name: string;
  period: PeriodKind;
  currency: string;
  status: string;
  visibility: string;
  rollover: boolean;
  alertThresholds: number[];
  window: { start: string; end: string; label: string };
  elapsedFraction: number;
  daysRemaining: number;
  totalLimit: MoneyDTO;
  totalSpent: MoneyDTO;
  totalRemaining: MoneyDTO;
  usedFraction: number;
  paceDelta: number;
  health: BudgetHealth;
  projected: MoneyDTO;
  projectedOverrun: MoneyDTO;
  lines: BudgetLineDTO[];
}

function periodOptions(actor: ActorContext) {
  return { weekStartsOn: actor.weekStartsOn, monthStartsOn: actor.monthStartsOn };
}

async function hydrate(
  actor: ActorContext,
  budget: {
    id: string;
    name: string;
    period: string;
    currency: string;
    status: string;
    visibility: string;
    rollover: boolean;
    /** Nullable in the schema; the DTO substitutes the default. */
    alertThresholds: number[] | null;
    totalLimitMinor: bigint | null;
    startsOn: Date | null;
    endsOn: Date | null;
    categories: Array<{
      categoryId: string;
      limitMinor: bigint;
      rollover: boolean;
      rolloverMinor: bigint;
      fixed: boolean;
      category: { name: string; colorIndex: number; icon: string };
    }>;
  },
  on: Date,
  db: Db,
): Promise<BudgetDTO> {
  const kind = budget.period as PeriodKind;
  const window = periodFor(kind, on, {
    ...periodOptions(actor),
    customStart: budget.startsOn ?? undefined,
    customEnd: budget.endsOn ?? undefined,
  });

  const categoryIds = budget.categories.map((c) => c.categoryId);
  const spend = categoryIds.length
    ? await spendingByCategory(
        actor.userId,
        window.start,
        window.end,
        { categoryIds, excludeFlagged: true },
        db,
      )
    : [];
  const spendById = new Map(spend.map((s) => [s.categoryId ?? "", s]));

  const inputs = budget.categories.map((line) => ({
    categoryId: line.categoryId,
    limit: money(line.limitMinor, budget.currency),
    rollover: line.rollover ? money(line.rolloverMinor, budget.currency) : undefined,
    spent: money(spendById.get(line.categoryId)?.spendingMinor ?? 0n, budget.currency),
    fixed: line.fixed,
  }));

  const summary = summarise(inputs, window, {
    currency: budget.currency,
    totalLimit:
      budget.totalLimitMinor !== null ? money(budget.totalLimitMinor, budget.currency) : null,
    now: on,
  });

  const lines: BudgetLineDTO[] = summary.lines.map((line, i) => {
    const source = budget.categories[i];
    return {
      categoryId: line.categoryId,
      fixed: line.fixed,
      categoryName: source.category.name,
      colorIndex: source.category.colorIndex,
      icon: source.category.icon,
      limit: toDTO(line.limit),
      effectiveLimit: toDTO(line.effectiveLimit),
      rollover: source.rollover ? toDTO(money(source.rolloverMinor, budget.currency)) : null,
      spent: toDTO(line.spent),
      remaining: toDTO(line.remaining),
      usedFraction: line.usedFraction,
      paceDelta: line.paceDelta,
      health: line.health,
      projected: toDTO(line.projected),
      projectedOverrun: toDTO(line.projectedOverrun),
      transactionCount: spendById.get(line.categoryId)?.count ?? 0,
    };
  });

  return {
    id: budget.id,
    name: budget.name,
    period: kind,
    currency: budget.currency,
    status: budget.status,
    visibility: budget.visibility,
    rollover: budget.rollover,
    alertThresholds: budget.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS,
    window: {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      label: window.label,
    },
    elapsedFraction: summary.elapsedFraction,
    daysRemaining: summary.daysRemaining,
    totalLimit: toDTO(summary.totalLimit),
    totalSpent: toDTO(summary.totalSpent),
    totalRemaining: toDTO(summary.totalRemaining),
    usedFraction: summary.usedFraction,
    paceDelta: summary.paceDelta,
    health: summary.health,
    projected: toDTO(summary.projected),
    projectedOverrun: toDTO(summary.projectedOverrun),
    lines,
  };
}

/** Rename the join relation to the `categories` the DTO mapper expects. */
/**
 * `icon` and `colorIndex` are NOT NULL in the schema, and `categoryId` is a
 * required FK, so the joined row is always present — Drizzle types a `one`
 * relation as nullable regardless, which is why this states it explicitly.
 */
type BudgetLineRow = typeof budgetCategories.$inferSelect & {
  category: { name: string; colorIndex: number; icon: string };
};

function shape<T extends { budgetCategories: BudgetLineRow[] }>(row: T) {
  const { budgetCategories: lines, ...rest } = row;
  return { ...rest, categories: lines };
}

export async function list(
  actor: ActorContext,
  options: { on?: Date; includeArchived?: boolean } = {},
  db: Db = rootDb,
): Promise<BudgetDTO[]> {
  const on = options.on ?? new Date();
  const loaded = await db.query.budgets.findMany({
    where: and(
      eq(budgets.userId, actor.userId),
      isNull(budgets.deletedAt),
      options.includeArchived ? undefined : eq(budgets.status, "ACTIVE"),
    ),
    orderBy: [asc(budgets.createdAt)],
    with: {
      budgetCategories: {
        with: { category: { columns: { name: true, colorIndex: true, icon: true } } },
        orderBy: [desc(budgetCategories.limitMinor)],
      },
    },
  });
  const rows = loaded.map(shape);
  return Promise.all(rows.map((r) => hydrate(actor, r, on, db)));
}

export async function get(
  actor: ActorContext,
  id: string,
  on = new Date(),
  db: Db = rootDb,
): Promise<BudgetDTO> {
  const loaded = await db.query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.userId, actor.userId), isNull(budgets.deletedAt)),
    with: {
      budgetCategories: {
        with: { category: { columns: { name: true, colorIndex: true, icon: true } } },
        orderBy: [desc(budgetCategories.limitMinor)],
      },
    },
  });
  const row = loaded ? shape(loaded) : undefined;
  if (!row) throw new NotFoundError("That budget");
  return hydrate(actor, row, on, db);
}

export async function create(actor: ActorContext, input: CreateBudgetInput): Promise<BudgetDTO> {
  return withTransaction(rootDb, async (tx) => {
    const categoryIds = input.categories.map((c) => c.categoryId);
    if (categoryIds.length > 0) {
      const [ownedRow] = await tx
        .select({ n: count() })
        .from(categoriesTable)
        .where(
          and(
            inArray(categoriesTable.id, categoryIds),
            eq(categoriesTable.userId, actor.userId),
          ),
        );
      const owned = ownedRow?.n ?? 0;
      if (owned !== new Set(categoryIds).size) throw new NotFoundError("One of those categories");
    }

    const [inserted] = await tx
      .insert(budgets)
      .values({
        userId: actor.userId,
        name: input.name,
        period: input.period,
        currency: input.currency,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        totalLimitMinor: input.totalLimit
          ? parseAmountForCurrency(input.totalLimit, input.currency, actor.locale)
          : null,
        rollover: input.rollover,
        alertThresholds: input.alertThresholds,
        visibility: input.visibility,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That budget");

    // The lines are a second insert; the enclosing transaction is what keeps
    // a budget from ever existing without them.
    if (input.categories.length) {
      await tx.insert(budgetCategories).values(
        input.categories.map((c) => ({
          budgetId: inserted.id,
          categoryId: c.categoryId,
          limitMinor: parseAmountForCurrency(c.limit, input.currency, actor.locale),
          rollover: c.rollover || input.rollover,
        })),
      );
    }

    const reloaded = await tx.query.budgets.findFirst({
      where: eq(budgets.id, inserted.id),
      with: {
      budgetCategories: {
        with: { category: { columns: { name: true, colorIndex: true, icon: true } } },
        orderBy: [desc(budgetCategories.limitMinor)],
      },
    },
    });
    const budget = shape(reloaded!);

    await audit.record(
      actor,
      {
        action: "budget.create",
        entityType: "Budget",
        entityId: budget.id,
        after: {
          name: budget.name,
          period: budget.period,
          totalLimitMinor: budget.totalLimitMinor,
          lines: input.categories.length,
        },
      },
      tx,
    );

    return hydrate(actor, budget, new Date(), tx);
  });
}

export async function update(
  actor: ActorContext,
  id: string,
  input: z.infer<typeof updateBudgetSchema>,
): Promise<BudgetDTO> {
  return withTransaction(rootDb, async (tx) => {
    const loadedBefore = await tx.query.budgets.findFirst({
      where: and(eq(budgets.id, id), eq(budgets.userId, actor.userId), isNull(budgets.deletedAt)),
      with: {
      budgetCategories: {
        with: { category: { columns: { name: true, colorIndex: true, icon: true } } },
        orderBy: [desc(budgetCategories.limitMinor)],
      },
    },
    });
    const before = loadedBefore ? shape(loadedBefore) : undefined;
    if (!before) throw new NotFoundError("That budget");

    await tx
      .update(budgets)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.totalLimit !== undefined
          ? {
              totalLimitMinor: input.totalLimit
                ? parseAmountForCurrency(input.totalLimit, before.currency, actor.locale)
                : null,
            }
          : {}),
        ...(input.rollover !== undefined ? { rollover: input.rollover } : {}),
        ...(input.alertThresholds !== undefined ? { alertThresholds: input.alertThresholds } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(and(eq(budgets.id, id), eq(budgets.userId, actor.userId)));

    if (input.categories) {
      const categoryIds = input.categories.map((c) => c.categoryId);
      const [ownedRow] = await tx
        .select({ n: count() })
        .from(categoriesTable)
        .where(
          and(
            inArray(categoriesTable.id, categoryIds),
            eq(categoriesTable.userId, actor.userId),
          ),
        );
      const owned = ownedRow?.n ?? 0;
      if (owned !== new Set(categoryIds).size) throw new NotFoundError("One of those categories");

      // Replace the line set, keeping any accumulated rollover for lines that
      // survive — losing it would silently reset a carried-forward overspend.
      const existingRollover = new Map(
        before.categories.map((c) => [c.categoryId, c.rolloverMinor]),
      );
      const existingFixed = new Map(before.categories.map((c) => [c.categoryId, c.fixed]));
      await tx.delete(budgetCategories).where(eq(budgetCategories.budgetId, id));
      if (input.categories.length) {
        await tx.insert(budgetCategories).values(
          input.categories.map((c) => ({
            budgetId: id,
            categoryId: c.categoryId,
            limitMinor: parseAmountForCurrency(c.limit, before.currency, actor.locale),
            rollover: c.rollover,
            fixed: c.fixed ?? existingFixed.get(c.categoryId) ?? false,
            rolloverMinor: existingRollover.get(c.categoryId) ?? 0n,
          })),
        );
      }
    }

    const loadedAfter = await tx.query.budgets.findFirst({
      where: and(eq(budgets.id, id), eq(budgets.userId, actor.userId)),
      with: {
      budgetCategories: {
        with: { category: { columns: { name: true, colorIndex: true, icon: true } } },
        orderBy: [desc(budgetCategories.limitMinor)],
      },
    },
    });
    const after = loadedAfter ? shape(loadedAfter) : undefined;
    if (!after) throw new NotFoundError("That budget");

    await audit.record(
      actor,
      {
        action: "budget.update",
        entityType: "Budget",
        entityId: id,
        before: {
          name: before.name,
          totalLimitMinor: before.totalLimitMinor,
          rollover: before.rollover,
        },
        after: {
          name: after.name,
          totalLimitMinor: after.totalLimitMinor,
          rollover: after.rollover,
        },
      },
      tx,
    );

    return hydrate(actor, after, new Date(), tx);
  });
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.userId, actor.userId), isNull(budgets.deletedAt)),
  });
  if (!before) throw new NotFoundError("That budget");
  await rootDb
    .update(budgets)
    .set({ deletedAt: new Date() })
    .where(and(eq(budgets.id, id), eq(budgets.userId, actor.userId)));
  await audit.record(actor, {
    action: "budget.delete",
    entityType: "Budget",
    entityId: id,
    before,
  });
}

/**
 * Propose limits from the last three months of actual spending.
 * A budget invented from nothing gets ignored; one that starts from what you
 * already spend is a decision the user can actually hold themselves to.
 */
export async function suggestFromHistory(
  actor: ActorContext,
  options: { months?: number; period?: PeriodKind } = {},
): Promise<
  Array<{
    categoryId: string;
    categoryName: string;
    colorIndex: number;
    suggested: MoneyDTO;
    history: MoneyDTO[];
  }>
> {
  const months = options.months ?? 3;
  const kind = options.period ?? "MONTHLY";
  const now = new Date();

  const windows = [];
  let cursor = periodFor(kind, now, periodOptions(actor));
  for (let i = 0; i < months; i++) {
    cursor = previousPeriod(kind, cursor, periodOptions(actor));
    windows.push(cursor);
  }

  const byCategory = new Map<string, { name: string; colorIndex: number; amounts: bigint[] }>();
  for (const window of windows) {
    const spend = await spendingByCategory(actor.userId, window.start, window.end, {
      excludeFlagged: true,
    });
    for (const row of spend) {
      if (!row.categoryId) continue;
      const entry = byCategory.get(row.categoryId) ?? {
        name: row.name ?? "Uncategorised",
        colorIndex: row.colorIndex ?? 12,
        amounts: [],
      };
      entry.amounts.push(row.spendingMinor);
      byCategory.set(row.categoryId, entry);
    }
  }

  return [...byCategory.entries()]
    .map(([categoryId, entry]) => {
      const history = entry.amounts.map((a) => money(a, actor.baseCurrency));
      return {
        categoryId,
        categoryName: entry.name,
        colorIndex: entry.colorIndex,
        suggested: toDTO(suggestLimit(history, actor.baseCurrency)),
        history: history.map(toDTO),
      };
    })
    .filter((s) => BigInt(s.suggested.minor) > 0n)
    .sort((a, b) => Number(BigInt(b.suggested.minor) - BigInt(a.suggested.minor)));
}

/**
 * Roll a budget's lines into the next period.
 * Called by the budget-alerts job at a period boundary. Underspend carries
 * forward as a credit; overspend carries forward as a debit, which is the only
 * version of rollover that changes behaviour.
 */
export async function rolloverPeriods(
  actor: ActorContext,
  now = new Date(),
  db: Db = rootDb,
): Promise<{ updated: number }> {
  const loadedBudgets = await db.query.budgets.findMany({
    where: and(
      eq(budgets.userId, actor.userId),
      isNull(budgets.deletedAt),
      eq(budgets.status, "ACTIVE"),
      eq(budgets.rollover, true),
    ),
    with: {
      budgetCategories: {
        with: { category: { columns: { name: true, colorIndex: true, icon: true } } },
        orderBy: [desc(budgetCategories.limitMinor)],
      },
    },
  });
  const activeBudgets = loadedBudgets.map(shape);

  let updated = 0;
  for (const budget of activeBudgets) {
    const kind = budget.period as PeriodKind;
    const current = periodFor(kind, now, periodOptions(actor));
    const previous = previousPeriod(kind, current, periodOptions(actor));

    for (const line of budget.categories) {
      if (!line.rollover) continue;
      // Already rolled for this period.
      if (line.rolloverUpdatedAt && line.rolloverUpdatedAt >= current.start) continue;

      const spend = await spendingByCategory(
        actor.userId,
        previous.start,
        previous.end,
        { categoryIds: [line.categoryId], excludeFlagged: true },
        db,
      );
      const spent = money(spend[0]?.spendingMinor ?? 0n, budget.currency);
      const result = evaluateLine(
        {
          categoryId: line.categoryId,
          limit: money(line.limitMinor, budget.currency),
          rollover: money(line.rolloverMinor, budget.currency),
          spent,
        },
        previous,
        previous.end,
      );

      await db
        .update(budgetCategories)
        .set({
          rolloverMinor: computeRollover(result).minor,
          rolloverUpdatedAt: new Date(),
        })
        .where(eq(budgetCategories.id, line.id));
      updated++;
    }
  }
  return { updated };
}

/** Which budget lines have newly crossed an alert threshold. */
export async function pendingAlerts(
  actor: ActorContext,
  now = new Date(),
  db: Db = rootDb,
): Promise<
  Array<{
    budgetId: string;
    budgetName: string;
    categoryId: string;
    categoryName: string;
    threshold: number;
    usedFraction: number;
    spent: MoneyDTO;
    limit: MoneyDTO;
    dedupeKey: string;
  }>
> {
  const budgets = await list(actor, { on: now }, db);
  const out: Awaited<ReturnType<typeof pendingAlerts>> = [];

  for (const budget of budgets) {
    for (const line of budget.lines) {
      // A fixed cost hits 100% of its limit by design; alerting on that every
      // month would train the user to ignore budget alerts entirely.
      if (line.fixed && line.usedFraction <= 1.0005) continue;
      const crossed = crossedThresholds(
        line.usedFraction,
        budget.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS,
        [],
      );
      for (const threshold of crossed) {
        out.push({
          budgetId: budget.id,
          budgetName: budget.name,
          categoryId: line.categoryId,
          categoryName: line.categoryName,
          threshold,
          usedFraction: line.usedFraction,
          spent: line.spent,
          limit: line.effectiveLimit,
          // The unique index on (userId, dedupeKey) is what stops the job from
          // sending the same alert every 30 minutes for the rest of the month.
          dedupeKey: `budget:${budget.id}:${line.categoryId}:${budget.window.start.slice(0, 10)}:${threshold}`,
        });
      }
    }
  }
  return out;
}

export { zero };
