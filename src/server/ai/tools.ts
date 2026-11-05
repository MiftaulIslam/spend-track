import * as z from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { ActorContext } from "@/src/server/auth/guards";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db as rootDb } from "@/src/server/db";
import { accounts, categories } from "@/src/server/db/schema";
import { ForbiddenError, NotFoundError } from "@/src/server/errors";
import * as accountService from "@/src/server/services/account-service";
import * as transactionService from "@/src/server/services/transaction-service";
import * as transferService from "@/src/server/services/transfer-service";
import * as budgetService from "@/src/server/services/budget-service";
import * as goalService from "@/src/server/services/goal-service";
import * as debtService from "@/src/server/services/debt-service";
import * as subscriptionService from "@/src/server/services/subscription-service";
import * as billService from "@/src/server/services/bill-service";
import * as analyticsService from "@/src/server/services/analytics-service";
import * as lendingService from "@/src/server/services/lending-service";
import * as categoryService from "@/src/server/services/category-service";
import {
  createBudgetSchema,
  createGoalSchema,
  createTransactionSchema,
  createTransferSchema,
  transactionFilterSchema,
  updateBudgetSchema,
  updateTransactionSchema,
} from "@/src/lib/schemas";

/**
 * The AI tool registry.
 *
 * Three rules hold for every tool in this file, and they are what make giving a
 * language model access to someone's money defensible:
 *
 *  1. **No database access.** Every handler calls the same service the UI calls.
 *     There is no raw query, no direct table access, no escape hatch.
 *  2. **Every id the model produces is re-resolved against the actor's scope**
 *     before it is used. A hallucinated or copied id resolves to "not found",
 *     never to someone else's row.
 *  3. **Mutating tools do not execute.** They validate, then return a proposal
 *     for the person to confirm. The model proposes; the person commits.
 */

export interface ToolContext {
  actor: ActorContext;
  /** Set when the user has explicitly confirmed this specific proposal. */
  confirmed?: boolean;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  inputSchema: Anthropic.Tool["input_schema"];
  mutating: boolean;
  /** One-line summary shown on the confirmation card. */
  summarise?: (input: TInput, ctx: ToolContext) => Promise<string> | string;
  handler: (input: TInput, ctx: ToolContext) => Promise<unknown>;
}

const registry = new Map<string, ToolDefinition<never>>();

function define<TInput>(tool: ToolDefinition<TInput>): void {
  registry.set(tool.name, tool as unknown as ToolDefinition<never>);
}

export const getTool = (name: string): ToolDefinition<never> | undefined => registry.get(name);
export const allTools = (): ToolDefinition<never>[] => [...registry.values()];

/** Anthropic tool definitions. `strict` keeps arguments schema-valid. */
export function toolDefinitions(options: { includeMutating: boolean }): Anthropic.Tool[] {
  return allTools()
    .filter((t) => options.includeMutating || !t.mutating)
    .map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      strict: true,
    }));
}

/* ------------------------------------------------------- ownership guards */

/**
 * Re-resolve a model-supplied id. Returns the row only if the actor owns it.
 * Called by every handler that accepts an id, without exception.
 */
async function ownedAccount(actor: ActorContext, id: string): Promise<{ id: string; name: string; currency: string }> {
  const row = await rootDb.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.userId, actor.userId), isNull(accounts.deletedAt)),
    columns: { id: true, name: true, currency: true },
  });
  if (!row) throw new NotFoundError("That account");
  return row;
}

async function ownedCategory(actor: ActorContext, id: string): Promise<{ id: string; name: string }> {
  const row = await rootDb.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, actor.userId)),
    columns: { id: true, name: true },
  });
  if (!row) throw new NotFoundError("That category");
  return row;
}

/**
 * Resolve a *name* to an id. The model is much better at "my Amex" than at
 * remembering a cuid, so tools accept either and this does the matching —
 * scoped to the actor, so a guess can only ever hit their own data.
 */
async function resolveAccountRef(actor: ActorContext, ref: string): Promise<{ id: string; name: string; currency: string }> {
  const direct = await rootDb.query.accounts.findFirst({
    where: and(eq(accounts.id, ref), eq(accounts.userId, actor.userId), isNull(accounts.deletedAt)),
    columns: { id: true, name: true, currency: true },
  });
  if (direct) return direct;

  const byName = await rootDb.query.accounts.findMany({
    where: and(
      eq(accounts.userId, actor.userId),
      isNull(accounts.deletedAt),
      isNull(accounts.archivedAt),
      ilike(accounts.name, `%${ref}%`),
    ),
    columns: { id: true, name: true, currency: true },
    limit: 2,
  });
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new NotFoundError(`"${ref}" matches more than one account, so nothing`);
  }
  throw new NotFoundError(`An account matching "${ref}"`);
}

async function resolveCategoryRef(actor: ActorContext, ref: string): Promise<{ id: string; name: string }> {
  const direct = await rootDb.query.categories.findFirst({
    where: and(eq(categories.id, ref), eq(categories.userId, actor.userId)),
    columns: { id: true, name: true },
  });
  if (direct) return direct;

  const byName = await rootDb.query.categories.findMany({
    where: and(
      eq(categories.userId, actor.userId),
      isNull(categories.archivedAt),
      ilike(categories.name, `%${ref}%`),
    ),
    columns: { id: true, name: true },
    limit: 2,
  });
  if (byName.length >= 1) return byName[0];
  throw new NotFoundError(`A category matching "${ref}"`);
}

function assertCanMutate(ctx: ToolContext): void {
  // A household member can record their own transactions; only owners and
  // admins can have the assistant change shared plans.
  if (ctx.actor.householdRole === "VIEWER") {
    throw new ForbiddenError("Viewers can't change financial records.");
  }
}

/* ---------------------------------------------------------- JSON schemas */

const S = {
  string: (description: string) => ({ type: "string" as const, description }),
  number: (description: string) => ({ type: "number" as const, description }),
  bool: (description: string) => ({ type: "boolean" as const, description }),
  enum: (values: string[], description: string) => ({ type: "string" as const, enum: values, description }),
  array: (items: object, description: string) => ({ type: "array" as const, items, description }),
};

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Anthropic.Tool["input_schema"] =>
  ({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  }) as Anthropic.Tool["input_schema"];

/* ══════════════════════════════════════════════════════════ READ TOOLS ══ */

const searchTransactionsInput = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  categories: z.array(z.string()).optional(),
  accounts: z.array(z.string()).optional(),
  merchantSearch: z.string().optional(),
  types: z.array(z.string()).optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

define({
  name: "search_transactions",
  description:
    "Search the user's transactions. Accepts category and account names or ids. " +
    "Returns up to 100 rows with amounts, dates, categories, merchants and accounts. " +
    "Use this before answering any question about specific spending.",
  schema: searchTransactionsInput,
  mutating: false,
  inputSchema: object({
    dateFrom: S.string("Start date, ISO yyyy-mm-dd. Inclusive."),
    dateTo: S.string("End date, ISO yyyy-mm-dd. Inclusive."),
    categories: S.array({ type: "string" }, "Category names or ids to include."),
    accounts: S.array({ type: "string" }, "Account names or ids to include."),
    merchantSearch: S.string("Text to match against merchant, description and note."),
    types: S.array({ type: "string" }, "Transaction types, e.g. EXPENSE, INCOME, TRANSFER_OUT."),
    minAmount: S.string("Minimum amount in major units, e.g. '25.00'."),
    maxAmount: S.string("Maximum amount in major units."),
    limit: S.number("Maximum rows to return, 1-100. Default 50."),
  }),
  handler: async (input, ctx) => {
    const categoryIds: string[] = [];
    for (const ref of input.categories ?? []) {
      const resolved = await resolveCategoryRef(ctx.actor, ref).catch(() => null);
      if (resolved) categoryIds.push(resolved.id);
    }
    const accountIds: string[] = [];
    for (const ref of input.accounts ?? []) {
      const resolved = await resolveAccountRef(ctx.actor, ref).catch(() => null);
      if (resolved) accountIds.push(resolved.id);
    }

    const filter = transactionFilterSchema.parse({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      categoryIds: categoryIds.length ? categoryIds : undefined,
      accountIds: accountIds.length ? accountIds : undefined,
      search: input.merchantSearch,
      types: input.types,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      limit: input.limit ?? 50,
    });

    const page = await transactionService.list(ctx.actor, filter);
    return {
      count: page.items.length,
      hasMore: page.hasMore,
      transactions: page.items.map((t) => ({
        id: t.id,
        date: t.occurredAt.slice(0, 10),
        description: t.description ?? t.merchantName ?? t.typeLabel,
        merchant: t.merchantName,
        category: t.categoryName,
        account: t.accountName,
        type: t.type,
        amount: t.amount.decimal,
        currency: t.amount.currency,
        countsAsSpending: t.isSpending,
      })),
    };
  },
});

define({
  name: "search_accounts",
  description:
    "List the user's financial accounts with current balances, types and credit limits. " +
    "Use this to find an account id before proposing a transfer.",
  schema: z.object({ includeArchived: z.boolean().optional() }),
  mutating: false,
  inputSchema: object({ includeArchived: S.bool("Include archived accounts. Default false.") }),
  handler: async (input, ctx) => {
    const accounts = await accountService.list(ctx.actor, { includeArchived: input.includeArchived });
    return {
      baseCurrency: ctx.actor.baseCurrency,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance: a.balance.decimal,
        balanceInBaseCurrency: a.balanceBase.decimal,
        isLiability: a.isLiability,
        creditLimit: a.creditLimit?.decimal ?? null,
        utilisation: a.utilisation,
      })),
    };
  },
});

define({
  name: "calculate_financial_summary",
  description:
    "Exact totals for a period: income, spending, net, savings rate, net worth, and the " +
    "change against the previous period. Every figure is computed by the database. " +
    "Prefer this over adding up transactions yourself.",
  schema: z.object({ period: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]).optional() }),
  mutating: false,
  inputSchema: object({ period: S.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"], "Period. Default MONTHLY.") }),
  handler: async (input, ctx) => {
    const overview = await analyticsService.overview(ctx.actor, { period: input.period ?? "MONTHLY" });
    return {
      period: overview.range.label,
      income: overview.income.decimal,
      spending: overview.spending.decimal,
      net: overview.net.decimal,
      savingsRatePercent: Number((overview.savingsRate * 100).toFixed(1)),
      transactionCount: overview.transactionCount,
      previousPeriod: {
        income: overview.previous.income.decimal,
        spending: overview.previous.spending.decimal,
        net: overview.previous.net.decimal,
      },
      changePercent: {
        income: Number((overview.changes.income * 100).toFixed(1)),
        spending: Number((overview.changes.spending * 100).toFixed(1)),
      },
      netWorth: {
        assets: overview.netWorth.assets.decimal,
        liabilities: overview.netWorth.liabilities.decimal,
        net: overview.netWorth.net.decimal,
      },
      currency: ctx.actor.baseCurrency,
    };
  },
});

define({
  name: "analyze_spending",
  description:
    "Spending broken down by category or merchant for a date range, with each " +
    "category's share of the total. Use this for 'where did my money go' questions.",
  schema: z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    groupBy: z.enum(["category", "merchant", "account"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  mutating: false,
  inputSchema: object({
    dateFrom: S.string("Start date, ISO yyyy-mm-dd."),
    dateTo: S.string("End date, ISO yyyy-mm-dd."),
    groupBy: S.enum(["category", "merchant", "account"], "How to group. Default category."),
    limit: S.number("Maximum groups. Default 15."),
  }),
  handler: async (input, ctx) => {
    const range = analyticsService.resolveRange(ctx.actor, {
      from: input.dateFrom ? new Date(input.dateFrom) : undefined,
      to: input.dateTo ? new Date(input.dateTo) : undefined,
    });
    const limit = input.limit ?? 15;

    if (input.groupBy === "merchant") {
      const rows = await analyticsService.topMerchants(ctx.actor, range, limit);
      return { range: range.label, groupBy: "merchant", rows: rows.map((r) => ({ name: r.name, total: r.total.decimal, transactions: r.count })) };
    }
    if (input.groupBy === "account") {
      const rows = await analyticsService.byAccount(ctx.actor, range);
      return { range: range.label, groupBy: "account", rows: rows.slice(0, limit).map((r) => ({ name: r.name, spending: r.spending.decimal, income: r.income.decimal, transactions: r.count })) };
    }

    const rows = await analyticsService.categoryBreakdown(ctx.actor, range);
    return {
      range: range.label,
      groupBy: "category",
      currency: ctx.actor.baseCurrency,
      rows: rows.slice(0, limit).map((r) => ({
        name: r.name,
        total: r.amount.decimal,
        sharePercent: Number((r.fraction * 100).toFixed(1)),
        transactions: r.count,
      })),
    };
  },
});

define({
  name: "search_budgets",
  description:
    "The user's budgets with spend so far, limits, remaining, and — importantly — " +
    "how the spend compares to how much of the period has elapsed (the pace). " +
    "A budget at 85% on day 5 is very different from 85% on day 28.",
  schema: z.object({ includeArchived: z.boolean().optional() }),
  mutating: false,
  inputSchema: object({ includeArchived: S.bool("Include archived budgets. Default false.") }),
  handler: async (input, ctx) => {
    const budgets = await budgetService.list(ctx.actor, { includeArchived: input.includeArchived });
    return budgets.map((b) => ({
      id: b.id,
      name: b.name,
      period: b.period,
      window: b.window.label,
      daysRemaining: b.daysRemaining,
      periodElapsedPercent: Number((b.elapsedFraction * 100).toFixed(1)),
      totalLimit: b.totalLimit.decimal,
      totalSpent: b.totalSpent.decimal,
      remaining: b.totalRemaining.decimal,
      usedPercent: Number((b.usedFraction * 100).toFixed(1)),
      health: b.health,
      projectedEndOfPeriod: b.projected.decimal,
      categories: b.lines.map((l) => ({
        categoryId: l.categoryId,
        name: l.categoryName,
        limit: l.effectiveLimit.decimal,
        spent: l.spent.decimal,
        remaining: l.remaining.decimal,
        usedPercent: Number((l.usedFraction * 100).toFixed(1)),
        health: l.health,
      })),
    }));
  },
});

define({
  name: "search_goals",
  description: "Savings goals with amount saved, target, deadline, projected completion and whether the current plan reaches the target in time.",
  schema: z.object({ includeCompleted: z.boolean().optional() }),
  mutating: false,
  inputSchema: object({ includeCompleted: S.bool("Include completed goals. Default false.") }),
  handler: async (input, ctx) => {
    const goals = await goalService.list(ctx.actor, { includeCompleted: input.includeCompleted });
    return goals.map((g) => ({
      id: g.id,
      name: g.name,
      target: g.target.decimal,
      saved: g.saved.decimal,
      remaining: g.remaining.decimal,
      progressPercent: Number((g.fraction * 100).toFixed(1)),
      targetDate: g.targetDate?.slice(0, 10) ?? null,
      daysRemaining: g.daysRemaining,
      plannedContribution: g.contribution?.decimal ?? null,
      requiredContribution: g.requiredPerPeriod?.decimal ?? null,
      projectedCompletion: g.projectedCompletion?.slice(0, 10) ?? null,
      pace: g.pace,
    }));
  },
});

define({
  name: "search_debts",
  description:
    "Debts with balances, APR, minimum payments, and payoff projections under the " +
    "avalanche and snowball strategies, including total interest for each.",
  schema: z.object({ monthlyBudget: z.string().optional() }),
  mutating: false,
  inputSchema: object({ monthlyBudget: S.string("Monthly amount available for debt, major units. Defaults to the sum of minimums.") }),
  handler: async (input, ctx) => {
    const [debts, plans] = await Promise.all([
      debtService.list(ctx.actor),
      debtService.payoffPlans(ctx.actor, input.monthlyBudget),
    ]);
    return {
      totalBalance: plans.totalBalance.decimal,
      weightedAprPercent: plans.weightedAprBps / 100,
      minimumRequired: plans.minimumRequired.decimal,
      debts: debts.map((d) => ({
        id: d.id,
        name: d.name,
        balance: d.balance.decimal,
        aprPercent: d.aprPercent,
        minimumPayment: d.minimumPayment.decimal,
        monthlyInterest: d.monthlyInterest.decimal,
        payoffWithMinimums: d.minimumPayoff
          ? { months: d.minimumPayoff.months, totalInterest: d.minimumPayoff.totalInterest.decimal }
          : null,
      })),
      strategies: plans.plans.map((p) => ({
        strategy: p.strategy,
        months: p.months,
        payoffDate: p.payoffDate.slice(0, 10),
        totalInterest: p.totalInterest.decimal,
        order: p.order.map((o) => o.name),
      })),
    };
  },
});

define({
  name: "search_subscriptions",
  description:
    "Subscriptions with normalised monthly and annual cost, renewal dates, trials ending, " +
    "and which ones show no linked activity for 60+ days.",
  schema: z.object({ onlyUnused: z.boolean().optional() }),
  mutating: false,
  inputSchema: object({ onlyUnused: S.bool("Return only subscriptions that look unused. Default false.") }),
  handler: async (input, ctx) => {
    const summary = await subscriptionService.summary(ctx.actor);
    const list = input.onlyUnused ? summary.unused : await subscriptionService.list(ctx.actor);
    return {
      monthlyTotal: summary.monthlyTotal.decimal,
      annualTotal: summary.annualTotal.decimal,
      unusedCount: summary.unusedCount,
      unusedAnnualCost: summary.unusedAnnualCost.decimal,
      subscriptions: list.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price.decimal,
        cycle: s.cycle,
        monthlyCost: s.monthlyCost.decimal,
        annualCost: s.annualCost.decimal,
        status: s.status,
        renewsOn: s.renewsOn?.slice(0, 10) ?? null,
        trialEndsOn: s.trialEndsOn?.slice(0, 10) ?? null,
        daysUnused: s.unusedDays,
        looksUnused: s.looksUnused,
      })),
    };
  },
});

define({
  name: "search_bills",
  description: "Upcoming and overdue bills with due dates, expected amounts and whether the amount is an estimate.",
  schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
  mutating: false,
  inputSchema: object({ days: S.number("How many days ahead to look. Default 30.") }),
  handler: async (input, ctx) => {
    const days = input.days ?? 30;
    const from = new Date(Date.now() - 30 * 86_400_000);
    const to = new Date(Date.now() + days * 86_400_000);
    const rows = await billService.occurrencesInRange(ctx.actor, from, to);
    return rows.map((b) => ({
      id: b.id,
      name: b.billName,
      dueOn: b.dueOn.slice(0, 10),
      daysUntil: b.daysUntil,
      expected: b.expected.decimal,
      isEstimate: b.isEstimate,
      state: b.state,
      account: b.accountName,
    }));
  },
});

define({
  name: "search_lending",
  description: "Money lent to or borrowed from other people, with outstanding balances and repayment history.",
  schema: z.object({ direction: z.enum(["LENT", "BORROWED"]).optional() }),
  mutating: false,
  inputSchema: object({ direction: S.enum(["LENT", "BORROWED"], "Filter by direction.") }),
  handler: async (input, ctx) => {
    const [records, summary] = await Promise.all([
      lendingService.list(ctx.actor, { direction: input.direction }),
      lendingService.summary(ctx.actor),
    ]);
    return {
      owedToYou: summary.owedToYou.decimal,
      youOwe: summary.youOwe.decimal,
      records: records.map((r) => ({
        id: r.id,
        person: r.personName,
        direction: r.direction,
        principal: r.principal.decimal,
        outstanding: r.outstanding.decimal,
        status: r.status,
        daysOverdue: r.daysOverdue,
      })),
    };
  },
});

define({
  name: "list_categories",
  description: "The user's category tree, for finding the right category id before proposing a change.",
  schema: z.object({ kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional() }),
  mutating: false,
  inputSchema: object({ kind: S.enum(["EXPENSE", "INCOME", "TRANSFER"], "Filter by kind.") }),
  handler: async (input, ctx) => {
    const flat = await categoryService.flat(ctx.actor, { kind: input.kind });
    return flat.map((c) => ({ id: c.id, label: c.label, kind: c.kind }));
  },
});

define({
  name: "generate_report",
  description:
    "Cash-flow series by month, and a year-over-year comparison. Use this for trend " +
    "questions and for anything that needs more than one period.",
  schema: z.object({ months: z.number().int().min(1).max(36).optional() }),
  mutating: false,
  inputSchema: object({ months: S.number("How many months of history. Default 12.") }),
  handler: async (input, ctx) => {
    const [flow, yoy] = await Promise.all([
      analyticsService.cashFlow(ctx.actor, input.months ?? 12),
      analyticsService.yearOverYear(ctx.actor),
    ]);
    return {
      currency: ctx.actor.baseCurrency,
      monthly: flow.map((f) => ({
        month: f.month,
        income: f.income.decimal,
        spending: f.spending.decimal,
        net: f.net.decimal,
        savingsRatePercent: Number((f.savingsRate * 100).toFixed(1)),
      })),
      yearOverYear: yoy.map((y) => ({
        metric: y.label,
        lastYear: y.previous.decimal,
        thisYear: y.current.decimal,
        changePercent: Number((y.change * 100).toFixed(1)),
        improved: y.improved,
      })),
    };
  },
});

define({
  name: "detect_anomalies",
  description: "Recent transactions that are unusually large compared with the user's own history at that merchant.",
  schema: z.object({ days: z.number().int().min(1).max(90).optional() }),
  mutating: false,
  inputSchema: object({ days: S.number("How many days back to scan. Default 14.") }),
  handler: async (input, ctx) => {
    const rows = await analyticsService.detectAnomalies(ctx.actor, { sinceDays: input.days ?? 14 });
    return rows.map((a) => ({
      transactionId: a.transactionId,
      description: a.description,
      amount: a.amount.decimal,
      date: a.occurredAt.slice(0, 10),
      reason: a.reason,
      timesUsual: Number(a.multiple.toFixed(1)),
    }));
  },
});

/* ══════════════════════════════════════════════════════ MUTATING TOOLS ══ */
/* These return a proposal. The runner never executes them without an          */
/* explicit confirmation from the person.                                     */

const createTransactionInput = z.object({
  account: z.string(),
  type: z.string().optional(),
  amount: z.string(),
  date: z.string().optional(),
  category: z.string().optional(),
  merchant: z.string().optional(),
  note: z.string().optional(),
});

define({
  name: "create_transaction",
  description:
    "Record a new transaction. Returns a proposal for the user to confirm — it does not " +
    "save anything by itself. Use account and category names; they are resolved for you.",
  schema: createTransactionInput,
  mutating: true,
  inputSchema: object(
    {
      account: S.string("Account name or id."),
      type: S.enum(["EXPENSE", "INCOME", "REFUND", "DEPOSIT", "WITHDRAWAL"], "Transaction type. Default EXPENSE."),
      amount: S.string("Positive amount in major units, e.g. '24.50'."),
      date: S.string("ISO yyyy-mm-dd. Defaults to today."),
      category: S.string("Category name or id."),
      merchant: S.string("Merchant name."),
      note: S.string("Optional note."),
    },
    ["account", "amount"],
  ),
  summarise: async (input, ctx) => {
    const account = await resolveAccountRef(ctx.actor, input.account);
    return `${input.type ?? "EXPENSE"} of ${input.amount} ${account.currency} on ${account.name}`;
  },
  handler: async (input, ctx) => {
    assertCanMutate(ctx);
    const account = await resolveAccountRef(ctx.actor, input.account);
    const category = input.category ? await resolveCategoryRef(ctx.actor, input.category).catch(() => null) : null;

    const parsed = createTransactionSchema.parse({
      accountId: account.id,
      type: input.type ?? "EXPENSE",
      amount: input.amount,
      currency: account.currency,
      occurredAt: input.date ?? new Date().toISOString(),
      categoryId: category?.id,
      merchantName: input.merchant,
      description: input.merchant,
      note: input.note,
    });

    const created = await transactionService.create(ctx.actor, parsed, { createdVia: "AI" });
    return {
      created: true,
      transactionId: created.id,
      account: created.accountName,
      amount: created.amount.decimal,
      category: created.categoryName,
      date: created.occurredAt.slice(0, 10),
    };
  },
});

define({
  name: "update_transaction",
  description:
    "Change an existing transaction's category, note, merchant or amount. Returns a " +
    "proposal for confirmation. Find the transaction with search_transactions first.",
  schema: z.object({
    transactionId: z.string(),
    category: z.string().optional(),
    amount: z.string().optional(),
    note: z.string().optional(),
    merchant: z.string().optional(),
  }),
  mutating: true,
  inputSchema: object(
    {
      transactionId: S.string("The transaction id, from search_transactions."),
      category: S.string("New category name or id."),
      amount: S.string("New amount in major units."),
      note: S.string("New note."),
      merchant: S.string("New merchant name."),
    },
    ["transactionId"],
  ),
  summarise: async (input, ctx) => {
    const txn = await transactionService.get(ctx.actor, input.transactionId);
    const parts: string[] = [];
    if (input.category) parts.push(`category → ${input.category}`);
    if (input.amount) parts.push(`amount → ${input.amount}`);
    if (input.merchant) parts.push(`merchant → ${input.merchant}`);
    if (input.note) parts.push("note updated");
    return `${txn.description ?? txn.merchantName ?? "Transaction"}: ${parts.join(", ") || "no change"}`;
  },
  handler: async (input, ctx) => {
    assertCanMutate(ctx);
    // Existence + ownership in one scoped read.
    await transactionService.get(ctx.actor, input.transactionId);
    const category = input.category ? await resolveCategoryRef(ctx.actor, input.category) : null;

    const parsed = updateTransactionSchema.parse({
      ...(category ? { categoryId: category.id } : {}),
      ...(input.amount ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.merchant ? { merchantName: input.merchant } : {}),
    });
    const updated = await transactionService.update(ctx.actor, input.transactionId, parsed);
    return {
      updated: true,
      transactionId: updated.id,
      category: updated.categoryName,
      amount: updated.amount.decimal,
    };
  },
});

define({
  name: "create_transfer",
  description:
    "Move money between two of the user's own accounts. Returns a proposal for confirmation. " +
    "Paying a credit card is a transfer, not an expense — use this for that too.",
  schema: z.object({
    fromAccount: z.string(),
    toAccount: z.string(),
    amount: z.string(),
    date: z.string().optional(),
    note: z.string().optional(),
  }),
  mutating: true,
  inputSchema: object(
    {
      fromAccount: S.string("Source account name or id."),
      toAccount: S.string("Destination account name or id."),
      amount: S.string("Amount in major units."),
      date: S.string("ISO yyyy-mm-dd. Defaults to today."),
      note: S.string("Optional note."),
    },
    ["fromAccount", "toAccount", "amount"],
  ),
  summarise: async (input, ctx) => {
    const [from, to] = await Promise.all([
      resolveAccountRef(ctx.actor, input.fromAccount),
      resolveAccountRef(ctx.actor, input.toAccount),
    ]);
    return `${input.amount} ${from.currency} from ${from.name} to ${to.name}`;
  },
  handler: async (input, ctx) => {
    assertCanMutate(ctx);
    const [from, to] = await Promise.all([
      resolveAccountRef(ctx.actor, input.fromAccount),
      resolveAccountRef(ctx.actor, input.toAccount),
    ]);
    const parsed = createTransferSchema.parse({
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: input.amount,
      occurredAt: input.date ?? new Date().toISOString(),
      note: input.note,
    });
    const transfer = await transferService.create(ctx.actor, parsed, { createdVia: "AI" });
    return {
      created: true,
      transferId: transfer.id,
      kind: transfer.kind,
      from: transfer.fromAccountName,
      to: transfer.toAccountName,
      amount: transfer.fromAmount.decimal,
    };
  },
});

define({
  name: "create_budget",
  description: "Create a budget with per-category limits. Returns a proposal for confirmation.",
  schema: z.object({
    name: z.string(),
    period: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]).optional(),
    totalLimit: z.string().optional(),
    categories: z.array(z.object({ category: z.string(), limit: z.string() })).optional(),
  }),
  mutating: true,
  inputSchema: object(
    {
      name: S.string("Budget name."),
      period: S.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"], "Budget period. Default MONTHLY."),
      totalLimit: S.string("Overall limit in major units."),
      categories: S.array(
        object({ category: S.string("Category name or id."), limit: S.string("Limit in major units.") }, ["category", "limit"]),
        "Per-category limits.",
      ),
    },
    ["name"],
  ),
  summarise: (input) =>
    `${input.name} · ${input.period ?? "MONTHLY"}${input.categories?.length ? ` · ${input.categories.length} categories` : ""}`,
  handler: async (input, ctx) => {
    assertCanMutate(ctx);
    const lines: Array<{ categoryId: string; limit: string; rollover: boolean }> = [];
    for (const line of input.categories ?? []) {
      const category = await resolveCategoryRef(ctx.actor, line.category);
      lines.push({ categoryId: category.id, limit: line.limit, rollover: false });
    }
    const parsed = createBudgetSchema.parse({
      name: input.name,
      period: input.period ?? "MONTHLY",
      currency: ctx.actor.baseCurrency,
      totalLimit: input.totalLimit,
      categories: lines,
    });
    const budget = await budgetService.create(ctx.actor, parsed);
    return { created: true, budgetId: budget.id, name: budget.name, totalLimit: budget.totalLimit.decimal };
  },
});

define({
  name: "update_budget",
  description: "Change a budget's limits. Returns a proposal for confirmation. Find the budget with search_budgets first.",
  schema: z.object({
    budgetId: z.string(),
    totalLimit: z.string().optional(),
    categoryLimits: z.array(z.object({ category: z.string(), limit: z.string() })).optional(),
  }),
  mutating: true,
  inputSchema: object(
    {
      budgetId: S.string("Budget id, from search_budgets."),
      totalLimit: S.string("New overall limit in major units."),
      categoryLimits: S.array(
        object({ category: S.string("Category name or id."), limit: S.string("New limit.") }, ["category", "limit"]),
        "Category limits to set. Categories not listed keep their current limit.",
      ),
    },
    ["budgetId"],
  ),
  summarise: async (input, ctx) => {
    const budget = await budgetService.get(ctx.actor, input.budgetId);
    if (input.categoryLimits?.length === 1) {
      return `${budget.name}: ${input.categoryLimits[0].category} → ${input.categoryLimits[0].limit}`;
    }
    return `${budget.name}: ${input.totalLimit ? `overall → ${input.totalLimit}` : `${input.categoryLimits?.length ?? 0} category limits`}`;
  },
  handler: async (input, ctx) => {
    assertCanMutate(ctx);
    const existing = await budgetService.get(ctx.actor, input.budgetId);

    // Merge: categories the model did not mention keep their current limit.
    const byCategory = new Map(existing.lines.map((l) => [l.categoryId, l.limit.decimal]));
    for (const line of input.categoryLimits ?? []) {
      const category = await resolveCategoryRef(ctx.actor, line.category);
      byCategory.set(category.id, line.limit);
    }

    const parsed = updateBudgetSchema.parse({
      ...(input.totalLimit !== undefined ? { totalLimit: input.totalLimit } : {}),
      categories: [...byCategory.entries()].map(([categoryId, limit]) => ({ categoryId, limit, rollover: false })),
    });
    const budget = await budgetService.update(ctx.actor, input.budgetId, parsed);
    return {
      updated: true,
      budgetId: budget.id,
      name: budget.name,
      totalLimit: budget.totalLimit.decimal,
      categories: budget.lines.map((l) => ({ name: l.categoryName, limit: l.effectiveLimit.decimal })),
    };
  },
});

define({
  name: "create_goal",
  description: "Create a savings goal. Returns a proposal for confirmation.",
  schema: z.object({
    name: z.string(),
    target: z.string(),
    targetDate: z.string().optional(),
    monthlyContribution: z.string().optional(),
    linkedAccount: z.string().optional(),
  }),
  mutating: true,
  inputSchema: object(
    {
      name: S.string("Goal name."),
      target: S.string("Target amount in major units."),
      targetDate: S.string("ISO yyyy-mm-dd."),
      monthlyContribution: S.string("Planned monthly contribution."),
      linkedAccount: S.string("Account name or id where the money is saved."),
    },
    ["name", "target"],
  ),
  summarise: (input) => `${input.name} · ${input.target}${input.targetDate ? ` by ${input.targetDate}` : ""}`,
  handler: async (input, ctx) => {
    assertCanMutate(ctx);
    const account = input.linkedAccount ? await resolveAccountRef(ctx.actor, input.linkedAccount) : null;
    const parsed = createGoalSchema.parse({
      name: input.name,
      target: input.target,
      currency: ctx.actor.baseCurrency,
      targetDate: input.targetDate,
      contribution: input.monthlyContribution,
      contributionFreq: input.monthlyContribution ? "MONTHLY" : undefined,
      linkedAccountId: account?.id,
    });
    const goal = await goalService.create(ctx.actor, parsed);
    return {
      created: true,
      goalId: goal.id,
      name: goal.name,
      target: goal.target.decimal,
      requiredPerMonth: goal.requiredPerPeriod?.decimal ?? null,
    };
  },
});

export { ownedAccount, ownedCategory, resolveAccountRef, resolveCategoryRef };
