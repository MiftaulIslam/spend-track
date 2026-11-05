import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { transactions as txTable } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { addMonthsClamped, elapsedFraction, periodFor, previousPeriod, startOfUtcDay, type PeriodKind } from "@/src/domain/schedule";
import * as txnRepo from "@/src/server/repositories/transaction-repository";
import * as accountRepo from "@/src/server/repositories/account-repository";
import * as accountService from "./account-service";

/**
 * Analytics.
 *
 * Every figure on every chart comes from a SQL aggregate in this file or in the
 * transaction repository. Nothing here is estimated, and the AI is never asked
 * to produce a number that will be rendered as fact — it is only ever given
 * these results to explain.
 */

function periodOpts(actor: ActorContext) {
  return { weekStartsOn: actor.weekStartsOn, monthStartsOn: actor.monthStartsOn };
}

export interface Range {
  from: Date;
  to: Date;
  label: string;
}

export function resolveRange(
  actor: ActorContext,
  input: { from?: Date; to?: Date; period?: PeriodKind } = {},
): Range {
  if (input.from && input.to) {
    return { from: startOfUtcDay(input.from), to: startOfUtcDay(input.to), label: "Custom range" };
  }
  const window = periodFor(input.period ?? "MONTHLY", new Date(), periodOpts(actor));
  return { from: window.start, to: window.end, label: window.label };
}

export interface OverviewDTO {
  range: { from: string; to: string; label: string };
  /** True when the period is still running, so `previous` is period-to-date. */
  partial: boolean;
  elapsedFraction: number;
  income: MoneyDTO;
  spending: MoneyDTO;
  net: MoneyDTO;
  savingsRate: number;
  transactionCount: number;
  previous: { income: MoneyDTO; spending: MoneyDTO; net: MoneyDTO };
  changes: { income: number; spending: number; net: number };
  netWorth: accountService.NetWorth;
}

/**
 * The dashboard's headline block: this period against the last one.
 *
 * Mid-period, the comparison is **period-to-date**: 17 days of this month
 * against the first 17 days of last month. Comparing a half-finished month to a
 * complete one reports income "down 50%" on the 15th of every month, which is
 * arithmetically true and completely useless.
 */
export async function overview(
  actor: ActorContext,
  input: { period?: PeriodKind } = {},
  db: Db = rootDb,
): Promise<OverviewDTO> {
  const kind = input.period ?? "MONTHLY";
  const now_ = new Date();
  const current = periodFor(kind, now_, periodOpts(actor));
  const prior = previousPeriod(kind, current, periodOpts(actor));

  const elapsed = elapsedFraction(current, now_);
  const partial = elapsed < 0.999;

  // Cut the prior period at the same offset, so like is compared with like.
  const priorCutoff = partial
    ? new Date(prior.start.getTime() + (prior.end.getTime() - prior.start.getTime()) * elapsed)
    : prior.end;

  const [now, before, worth] = await Promise.all([
    txnRepo.totalsSql(actor.userId, current.start, current.end, db),
    txnRepo.totalsSql(actor.userId, prior.start, priorCutoff, db),
    accountService.netWorth(actor, db),
  ]);

  const net = now.incomeMinor - now.spendingMinor;
  const priorNet = before.incomeMinor - before.spendingMinor;

  return {
    range: { from: current.start.toISOString(), to: current.end.toISOString(), label: current.label },
    partial,
    elapsedFraction: elapsed,
    income: toDTO(money(now.incomeMinor, actor.baseCurrency)),
    spending: toDTO(money(now.spendingMinor, actor.baseCurrency)),
    net: toDTO(money(net, actor.baseCurrency)),
    savingsRate: now.incomeMinor > 0n ? Number(net) / Number(now.incomeMinor) : 0,
    transactionCount: now.count,
    previous: {
      income: toDTO(money(before.incomeMinor, actor.baseCurrency)),
      spending: toDTO(money(before.spendingMinor, actor.baseCurrency)),
      net: toDTO(money(priorNet, actor.baseCurrency)),
    },
    changes: {
      income: percentChange(before.incomeMinor, now.incomeMinor),
      spending: percentChange(before.spendingMinor, now.spendingMinor),
      net: percentChange(priorNet, net),
    },
    netWorth: worth,
  };
}

function percentChange(before: bigint, after: bigint): number {
  if (before === 0n) return after === 0n ? 0 : 1;
  return Number(after - before) / Math.abs(Number(before));
}

export async function categoryBreakdown(
  actor: ActorContext,
  range: Range,
  db: Db = rootDb,
): Promise<Array<{ categoryId: string | null; name: string; colorIndex: number; amount: MoneyDTO; fraction: number; count: number }>> {
  const rows = await txnRepo.spendingByCategory(actor.userId, range.from, range.to, {}, db);
  const total = rows.reduce((acc, r) => acc + (r.spendingMinor > 0n ? r.spendingMinor : 0n), 0n);

  return rows
    .filter((r) => r.spendingMinor > 0n)
    .map((r) => ({
      categoryId: r.categoryId,
      name: r.name ?? "Uncategorised",
      colorIndex: r.colorIndex ?? 12,
      amount: toDTO(money(r.spendingMinor, actor.baseCurrency)),
      fraction: total > 0n ? Number(r.spendingMinor) / Number(total) : 0,
      count: r.count,
    }));
}

export async function cashFlow(
  actor: ActorContext,
  months = 12,
  db: Db = rootDb,
): Promise<Array<{ month: string; income: MoneyDTO; spending: MoneyDTO; net: MoneyDTO; savingsRate: number }>> {
  const to = addMonthsClamped(startOfUtcDay(new Date()), 1, 1);
  const from = addMonthsClamped(to, -months, 1);
  const rows = await txnRepo.monthlyFlow(actor.userId, from, to, db);

  return rows.map((r) => {
    const net = r.incomeMinor - r.spendingMinor;
    return {
      month: r.month.toISOString().slice(0, 7),
      income: toDTO(money(r.incomeMinor, actor.baseCurrency)),
      spending: toDTO(money(r.spendingMinor, actor.baseCurrency)),
      net: toDTO(money(net, actor.baseCurrency)),
      savingsRate: r.incomeMinor > 0n ? Number(net) / Number(r.incomeMinor) : 0,
    };
  });
}

export async function topMerchants(actor: ActorContext, range: Range, limit = 10, db: Db = rootDb) {
  const rows = await txnRepo.topMerchants(actor.userId, range.from, range.to, limit, db);
  return rows.map((r) => ({
    merchantId: r.merchantId,
    name: r.name,
    total: toDTO(money(r.totalMinor, actor.baseCurrency)),
    count: r.count,
  }));
}

/** Spend by account — answers "which card is doing the damage". */
export async function byAccount(actor: ActorContext, range: Range, db: Db = rootDb) {
  const result = await db.execute<{
    accountId: string;
    name: string;
    type: string;
    spending: string;
    income: string;
    count: string;
  }>(sql`
    SELECT a.id AS "accountId", a.name, a.type::text AS type,
           (COALESCE(SUM(t."baseAmountMinor") FILTER (WHERE t.type IN ('EXPENSE','FEE')), 0)
             - COALESCE(SUM(t."baseAmountMinor") FILTER (WHERE t.type IN ('REFUND','REIMBURSEMENT')), 0))::bigint AS spending,
           COALESCE(SUM(t."baseAmountMinor") FILTER (WHERE t.type IN ('INCOME','INTEREST','DIVIDEND')), 0)::bigint AS income,
           COUNT(t.id) AS count
    FROM accounts a
    LEFT JOIN transactions t
      ON t."accountId" = a.id
     AND t."deletedAt" IS NULL
     AND t.status <> 'VOID'
     AND t."occurredAt" >= ${range.from}
     AND t."occurredAt" < ${range.to}
    WHERE a."userId" = ${actor.userId} AND a."deletedAt" IS NULL
    GROUP BY a.id, a.name, a.type
    HAVING COUNT(t.id) > 0
    ORDER BY spending DESC
  `);

  return result.rows.map((r) => ({
    accountId: r.accountId,
    name: r.name,
    type: r.type,
    spending: toDTO(money(BigInt(r.spending), actor.baseCurrency)),
    income: toDTO(money(BigInt(r.income), actor.baseCurrency)),
    count: Number(r.count),
  }));
}

/** Daily spend, for the sparkline and for anomaly detection. */
export async function dailySpend(actor: ActorContext, range: Range, db: Db = rootDb) {
  const result = await db.execute<{ day: Date; spending: string; count: string }>(sql`
    SELECT date_trunc('day', "occurredAt")::date AS day,
           (COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN ('EXPENSE','FEE')), 0)
             - COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN ('REFUND','REIMBURSEMENT')), 0))::bigint AS spending,
           COUNT(*) AS count
    FROM transactions
    WHERE "userId" = ${actor.userId}
      AND "deletedAt" IS NULL
      AND status <> 'VOID'
      AND "occurredAt" >= ${range.from}
      AND "occurredAt" < ${range.to}
    GROUP BY 1
    ORDER BY 1
  `);
  const rows = result.rows.map((r) => ({
    day: r.day instanceof Date ? r.day : new Date(String(r.day)),
    spending: BigInt(r.spending),
    count: r.count,
  }));
  return rows.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    spending: toDTO(money(r.spending, actor.baseCurrency)),
    count: Number(r.count),
  }));
}

/** Year-over-year comparison table. */
export async function yearOverYear(actor: ActorContext, db: Db = rootDb) {
  const thisYear = new Date().getUTCFullYear();
  const build = async (year: number) => {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const totals = await txnRepo.totalsSql(actor.userId, from, to, db);
    return { year, ...totals };
  };
  const [current, previous] = await Promise.all([build(thisYear), build(thisYear - 1)]);

  const rows = [
    { label: "Income", previous: previous.incomeMinor, current: current.incomeMinor, higherIsBetter: true },
    { label: "Expenses", previous: previous.spendingMinor, current: current.spendingMinor, higherIsBetter: false },
    {
      label: "Savings",
      previous: previous.incomeMinor - previous.spendingMinor,
      current: current.incomeMinor - current.spendingMinor,
      higherIsBetter: true,
    },
  ];

  return rows.map((r) => ({
    label: r.label,
    previous: toDTO(money(r.previous, actor.baseCurrency)),
    current: toDTO(money(r.current, actor.baseCurrency)),
    change: percentChange(r.previous, r.current),
    improved: r.higherIsBetter ? r.current > r.previous : r.current < r.previous,
  }));
}

export interface Anomaly {
  transactionId: string;
  description: string;
  merchantName: string | null;
  amount: MoneyDTO;
  occurredAt: string;
  reason: string;
  /** How many times the usual amount for this merchant this is. */
  multiple: number;
  dedupeKey: string;
}

/**
 * Unusual-transaction detection.
 *
 * Statistical, not AI: a charge is unusual when it is far above the trailing
 * median for that merchant, or far above the user's own large-transaction
 * threshold. Median rather than mean, because one prior outlier would otherwise
 * raise the bar and hide the next one.
 */
export async function detectAnomalies(
  actor: ActorContext,
  options: { sinceDays?: number; minMultiple?: number } = {},
  db: Db = rootDb,
): Promise<Anomaly[]> {
  const sinceDays = options.sinceDays ?? 7;
  const minMultiple = options.minMultiple ?? 3;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const history = new Date(Date.now() - 365 * 86_400_000);

  const recent = await db.query.transactions.findMany({
    where: and(
      eq(txTable.userId, actor.userId),
      isNull(txTable.deletedAt),
      gte(txTable.occurredAt, since),
      inArray(txTable.type, ["EXPENSE", "FEE"]),
    ),
    orderBy: [desc(txTable.occurredAt)],
    limit: 200,
    columns: {
      id: true,
      amountMinor: true,
      baseAmountMinor: true,
      currency: true,
      occurredAt: true,
      description: true,
      merchantId: true,
    },
    with: { merchant: { columns: { name: true } } },
  });
  if (recent.length === 0) return [];

  const merchantIds = [...new Set(recent.map((r) => r.merchantId).filter((x): x is string => Boolean(x)))];
  const priorByMerchant = new Map<string, bigint[]>();

  if (merchantIds.length > 0) {
    const prior = await db
      .select({ merchantId: txTable.merchantId, baseAmountMinor: txTable.baseAmountMinor })
      .from(txTable)
      .where(
        and(
          eq(txTable.userId, actor.userId),
          isNull(txTable.deletedAt),
          inArray(txTable.merchantId, merchantIds),
          gte(txTable.occurredAt, history),
          lt(txTable.occurredAt, since),
          inArray(txTable.type, ["EXPENSE", "FEE"]),
        ),
      );
    for (const p of prior) {
      const list = priorByMerchant.get(p.merchantId!) ?? [];
      list.push(p.baseAmountMinor);
      priorByMerchant.set(p.merchantId!, list);
    }
  }

  // A user-relative ceiling, so "large" means large *for them*.
  const allPrior = await db
    .select({ baseAmountMinor: txTable.baseAmountMinor })
    .from(txTable)
    .where(
      and(
        eq(txTable.userId, actor.userId),
        isNull(txTable.deletedAt),
        gte(txTable.occurredAt, history),
        lt(txTable.occurredAt, since),
        inArray(txTable.type, ["EXPENSE", "FEE"]),
      ),
    )
    .limit(5000);
  const globalP95 = percentile(allPrior.map((p) => p.baseAmountMinor), 0.95);

  const out: Anomaly[] = [];
  for (const txn of recent) {
    const priors = txn.merchantId ? priorByMerchant.get(txn.merchantId) ?? [] : [];
    let reason: string | null = null;
    let multiple = 1;

    if (priors.length >= 3) {
      const median = percentile(priors, 0.5);
      if (median > 0n) {
        multiple = Number(txn.baseAmountMinor) / Number(median);
        if (multiple >= minMultiple) {
          reason = `${multiple.toFixed(1)}× your usual spend at ${txn.merchant?.name ?? "this merchant"}`;
        }
      }
    }

    if (!reason && globalP95 > 0n && txn.baseAmountMinor > globalP95 * 2n) {
      multiple = Number(txn.baseAmountMinor) / Number(globalP95);
      reason = "Much larger than your typical transaction";
    }

    if (reason) {
      out.push({
        transactionId: txn.id,
        description: txn.description ?? txn.merchant?.name ?? "Transaction",
        merchantName: txn.merchant?.name ?? null,
        amount: toDTO(money(txn.baseAmountMinor, actor.baseCurrency)),
        occurredAt: txn.occurredAt.toISOString(),
        reason,
        multiple,
        dedupeKey: `anomaly:${txn.id}`,
      });
    }
  }

  return out.sort((a, b) => b.multiple - a.multiple);
}

function percentile(values: readonly bigint[], p: number): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[index];
}

/** Everything the dashboard needs, in as few round trips as possible. */
export async function dashboard(actor: ActorContext, db: Db = rootDb) {
  const range = resolveRange(actor, { period: "MONTHLY" });
  const [summary, categories, flow, netWorthSeries] = await Promise.all([
    overview(actor, { period: "MONTHLY" }, db),
    categoryBreakdown(actor, range, db),
    cashFlow(actor, 12, db),
    accountService.netWorthHistory(actor, 12, db),
  ]);

  return {
    summary,
    categories: categories.slice(0, 6),
    otherCategoriesTotal: toDTO(
      money(
        categories.slice(6).reduce((acc, c) => acc + BigInt(c.amount.minor), 0n),
        actor.baseCurrency,
      ),
    ),
    cashFlow: flow,
    netWorthSeries,
  };
}

export { accountRepo };
