import { sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import type { ActorContext } from "@/src/server/auth/guards";
import { ValidationError } from "@/src/server/errors";
import * as goalService from "./goal-service";
import { money, toDTO, zero, type MoneyDTO } from "@/src/domain/money";
import {
  type PlanVerdict,
  type SavingsFrequency,
  contributionFor,
  contributionToSave,
  depositSchedule,
  describePlan,
  planFor,
} from "@/src/domain/savings-plan";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import { todayInTimezone } from "@/src/domain/datetime";

/**
 * Savings targets — "how long until I can buy the thing?"
 *
 * Built on the goals table rather than a parallel one. A savings target *is* a
 * goal: an amount, what has been put aside, and money that actually moves when
 * you deposit. Splitting them would mean two tables holding "money set aside",
 * two deposit paths writing to the ledger, and a standing question about which
 * one the net-worth figure should trust.
 *
 * What is new is the direction of the question. A goal is planned from a date:
 * you say when you need it, the app says what to put aside. A target is planned
 * from a payment: you say what you can put aside, the app says when you get it —
 * and, because it can see your ledger, whether you can actually afford to.
 */

export interface SavingsTargetDTO {
  id: string;
  name: string;
  /** What the thing costs. */
  price: MoneyDTO;
  saved: MoneyDTO;
  remaining: MoneyDTO;
  /** 0…1. */
  fraction: number;
  contribution: MoneyDTO | null;
  frequency: SavingsFrequency;
  monthsRemaining: number | null;
  completionDate: string | null;
  /** The last deposit, which is usually smaller than the others. */
  finalDeposit: MoneyDTO;
  verdict: PlanVerdict;
  /** What this plan costs per month, whatever its frequency. */
  monthlyEquivalent: MoneyDTO;
  /** How far the plan exceeds what the user actually has spare. */
  monthlyShortfall: MoneyDTO;
  summary: string;
  linkedAccountId: string | null;
  linkedAccountName: string | null;
  colorIndex: number;
  icon: string;
  status: string;
}

/**
 * Typical money left over in a month, measured from the ledger.
 *
 * The median of the last six complete months, not the mean: one bonus or one
 * boiler replacement should not move the figure a plan is judged against. Only
 * complete months count — the current month is always short and would drag the
 * estimate down every time someone opened the page early.
 */
export async function monthlySurplus(actor: ActorContext, db: Db = rootDb): Promise<MoneyDTO> {
  const rows = await db.execute<{ month: Date; net: string }>(sql`
    SELECT date_trunc('month', "occurredAt") AS month,
           (COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN ('INCOME','INTEREST','DIVIDEND')), 0)
             - COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN ('EXPENSE','FEE')), 0)
             + COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN ('REFUND','REIMBURSEMENT')), 0)
           )::bigint AS net
    FROM transactions
    WHERE "userId" = ${actor.userId}
      AND "deletedAt" IS NULL
      AND status <> 'VOID'
      AND "occurredAt" >= date_trunc('month', now()) - interval '6 months'
      AND "occurredAt" < date_trunc('month', now())
    GROUP BY 1
    ORDER BY 1
  `);

  const nets = rows.rows.map((r) => BigInt(r.net)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (nets.length === 0) return toDTO(zero(actor.baseCurrency));

  const mid = Math.floor(nets.length / 2);
  const median =
    nets.length % 2 === 1 ? nets[mid]! : (nets[mid - 1]! + nets[mid]!) / 2n;

  // A negative median means they are spending more than they earn; the plan
  // checker treats that as "nothing spare", which is the honest reading.
  return toDTO(money(median > 0n ? median : 0n, actor.baseCurrency));
}

function toTarget(
  goal: goalService.GoalDTO,
  surplus: MoneyDTO | null,
  now: Date,
): SavingsTargetDTO {
  const currency = goal.target.currency;
  const price = money(BigInt(goal.target.minor), currency);
  const saved = money(BigInt(goal.saved.minor), currency);
  const contribution = goal.contribution
    ? money(BigInt(goal.contribution.minor), currency)
    : zero(currency);

  const plan = planFor(
    {
      target: price,
      saved,
      contribution,
      frequency: (goal.contributionFreq as SavingsFrequency) ?? "MONTHLY",
      monthlySurplus: surplus ? money(BigInt(surplus.minor), surplus.currency) : null,
    },
    now,
  );

  return {
    id: goal.id,
    name: goal.name,
    price: toDTO(price),
    saved: toDTO(saved),
    remaining: toDTO(plan.remaining),
    fraction: plan.fraction,
    contribution: goal.contribution,
    frequency: (goal.contributionFreq as SavingsFrequency) ?? "MONTHLY",
    monthsRemaining: Number.isFinite(plan.monthsRemaining) ? plan.monthsRemaining : null,
    completionDate: plan.completionDate?.toISOString() ?? null,
    finalDeposit: toDTO(plan.finalDeposit),
    verdict: plan.verdict,
    monthlyEquivalent: toDTO(plan.monthlyEquivalent),
    monthlyShortfall: toDTO(plan.monthlyShortfall),
    summary: describePlan(plan),
    linkedAccountId: goal.linkedAccountId,
    linkedAccountName: goal.linkedAccountName,
    colorIndex: goal.colorIndex,
    icon: goal.icon,
    status: goal.status,
  };
}

export async function list(
  actor: ActorContext,
  options: { includeCompleted?: boolean } = {},
  db: Db = rootDb,
): Promise<SavingsTargetDTO[]> {
  const [rows, surplus] = await Promise.all([
    goalService.list(actor, options, db),
    monthlySurplus(actor, db),
  ]);
  const now = new Date();
  return rows.map((g) => toTarget(g, surplus, now));
}

export async function get(
  actor: ActorContext,
  id: string,
  db: Db = rootDb,
): Promise<SavingsTargetDTO> {
  const [goal, surplus] = await Promise.all([
    goalService.get(actor, id, db),
    monthlySurplus(actor, db),
  ]);
  return toTarget(goal, surplus, new Date());
}

/**
 * Model a plan before anything is saved.
 *
 * Deliberately a read: the planner page recomputes on every keystroke, and
 * nothing should be written until the person commits.
 */
export async function preview(
  actor: ActorContext,
  input: {
    price: string;
    saved?: string;
    contribution?: string;
    /** The other direction: fix a date, get a contribution. */
    by?: Date | string;
    frequency?: SavingsFrequency;
    currency?: string;
  },
  db: Db = rootDb,
): Promise<{
  price: MoneyDTO;
  contribution: MoneyDTO;
  monthsRemaining: number | null;
  completionDate: string | null;
  finalDeposit: MoneyDTO;
  verdict: PlanVerdict;
  monthlyEquivalent: MoneyDTO;
  monthlyShortfall: MoneyDTO;
  surplus: MoneyDTO;
  summary: string;
  schedule: Array<{ index: number; on: string; amount: MoneyDTO; runningTotal: MoneyDTO }>;
  /** What it would take to finish six months sooner, for the "what if" row. */
  toFinishSooner: MoneyDTO | null;
}> {
  const currency = input.currency ?? actor.baseCurrency;
  const now = new Date();

  const price = money(parseAmountForCurrency(input.price, currency, actor.locale), currency);
  if (price.minor <= 0n) throw new ValidationError("Enter a price above zero.");

  const saved = input.saved
    ? money(parseAmountForCurrency(input.saved, currency, actor.locale), currency)
    : zero(currency);
  if (saved.minor < 0n) throw new ValidationError("Saved cannot be negative.");

  const frequency = input.frequency ?? "MONTHLY";
  const surplus = await monthlySurplus(actor, db);

  // A date given instead of a contribution means solving the other way round.
  let contribution =
    input.contribution && input.contribution.trim()
      ? money(parseAmountForCurrency(input.contribution, currency, actor.locale), currency)
      : zero(currency);

  if (contribution.minor <= 0n && input.by) {
    const by = input.by instanceof Date ? input.by : new Date(input.by);
    if (Number.isNaN(by.getTime())) throw new ValidationError("That date is not valid.");
    contribution = contributionFor({ target: price, saved, by, frequency }, now).perPeriod;
  }

  const plan = planFor(
    {
      target: price,
      saved,
      contribution,
      frequency,
      monthlySurplus: money(BigInt(surplus.minor), surplus.currency),
    },
    now,
  );

  return {
    price: toDTO(price),
    contribution: toDTO(contribution),
    monthsRemaining: Number.isFinite(plan.monthsRemaining) ? plan.monthsRemaining : null,
    completionDate: plan.completionDate?.toISOString() ?? null,
    finalDeposit: toDTO(plan.finalDeposit),
    verdict: plan.verdict,
    monthlyEquivalent: toDTO(plan.monthlyEquivalent),
    monthlyShortfall: toDTO(plan.monthlyShortfall),
    surplus,
    summary: describePlan(plan),
    schedule: depositSchedule(plan, frequency, now, 12).map((row) => ({
      index: row.index,
      on: row.on.toISOString(),
      amount: toDTO(row.amount),
      runningTotal: toDTO(row.runningTotal),
    })),
    toFinishSooner: (() => {
      const sooner = contributionToSave(plan, 6, frequency);
      return sooner ? toDTO(sooner) : null;
    })(),
  };
}

/**
 * Commit a plan.
 *
 * Creates the goal the target rides on. The contribution and frequency are
 * stored so the plan can be recomputed later without the user restating it.
 */
export async function create(
  actor: ActorContext,
  input: {
    name: string;
    price: string;
    contribution: string;
    frequency?: SavingsFrequency;
    currency?: string;
    linkedAccountId?: string | null;
    colorIndex?: number;
    icon?: string;
    note?: string | null;
  },
): Promise<SavingsTargetDTO> {
  const currency = input.currency ?? actor.baseCurrency;
  const frequency = input.frequency ?? "MONTHLY";

  const price = money(parseAmountForCurrency(input.price, currency, actor.locale), currency);
  if (price.minor <= 0n) throw new ValidationError("Enter a price above zero.");

  const contribution = money(
    parseAmountForCurrency(input.contribution, currency, actor.locale),
    currency,
  );
  if (contribution.minor <= 0n) {
    throw new ValidationError("Enter what you will put aside each period.");
  }

  // The projected completion is stored as the goal's target date, so the
  // existing goal views — which plan from a date — still read correctly.
  const plan = planFor({ target: price, saved: zero(currency), contribution, frequency });

  const goal = await goalService.create(actor, {
    name: input.name,
    target: toDTO(price).decimal,
    currency,
    targetDate: plan.completionDate ?? undefined,
    linkedAccountId: input.linkedAccountId ?? undefined,
    contribution: toDTO(contribution).decimal,
    contributionFreq: frequency,
    colorIndex: input.colorIndex ?? 6,
    icon: input.icon ?? "target",
    note: input.note ?? undefined,
    milestones: [],
  } as never);

  const surplus = await monthlySurplus(actor);
  return toTarget(goal, surplus, new Date());
}

/**
 * Put money in.
 *
 * Delegates to the goal service, which moves real money when the target has a
 * linked account: the deposit becomes a transfer, so the ledger and the target
 * can never disagree about how much has been set aside.
 *
 * A deposit larger than what is left is rejected rather than silently capped —
 * the caller is told the exact figure that would finish it, which is more
 * useful than an over-payment nobody asked for.
 */
export async function deposit(
  actor: ActorContext,
  input: { targetId: string; amount: string; fromAccountId?: string; occurredAt?: Date; note?: string },
): Promise<{
  target: SavingsTargetDTO;
  transactionId: string | null;
  completed: boolean;
  milestonesReached: string[];
}> {
  const current = await get(actor, input.targetId);
  const currency = current.price.currency;

  const amountMinor = parseAmountForCurrency(input.amount, currency, actor.locale);
  if (amountMinor <= 0n) throw new ValidationError("Enter an amount above zero.");

  const remaining = BigInt(current.remaining.minor);
  if (remaining <= 0n) throw new ValidationError("That target is already funded.");
  if (amountMinor > remaining) {
    throw new ValidationError(
      `That is more than the ${toDTO(money(remaining, currency)).decimal} still needed. Deposit ${
        toDTO(money(remaining, currency)).decimal
      } to finish it.`,
    );
  }

  const result = await goalService.contribute(actor, {
    goalId: input.targetId,
    amount: input.amount,
    fromAccountId: input.fromAccountId,
    occurredAt: input.occurredAt ?? new Date(),
    note: input.note,
  } as never);

  const surplus = await monthlySurplus(actor);
  return {
    target: toTarget(result.goal, surplus, new Date()),
    transactionId: result.transactionId,
    completed: result.completed,
    milestonesReached: result.milestonesReached,
  };
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  await goalService.remove(actor, id);
}

/**
 * Targets whose deposit is overdue, for the reminder job.
 *
 * "Overdue" means more than one period has passed since the last deposit — or,
 * for a target that has never been funded, since it was created. A target with
 * no contribution set is not overdue, it is just unplanned, and nagging about
 * it would train people to ignore the reminder.
 *
 * The interval comes from the stored frequency rather than a fixed 30 days, so
 * a quarterly plan is not chased monthly.
 */
export async function dueForDeposit(
  db: Db = rootDb,
): Promise<
  Array<{
    userId: string;
    goalId: string;
    name: string;
    amountMinor: bigint;
    currency: string;
    daysOverdue: number;
    dedupeKey: string;
  }>
> {
  const result = await db.execute<{
    userId: string;
    id: string;
    name: string;
    contributionMinor: string;
    currency: string;
    daysSince: string;
    period: string;
  }>(sql`
    SELECT g."userId",
           g.id,
           g.name,
           g."contributionMinor"::text AS "contributionMinor",
           g.currency,
           -- Days since the last deposit, or since the target was created.
           EXTRACT(
             DAY FROM now() - COALESCE(MAX(c."occurredAt"), g."createdAt")
           )::int::text AS "daysSince",
           CASE g."contributionFreq"
             WHEN 'WEEKLY' THEN 7
             WHEN 'BIWEEKLY' THEN 14
             WHEN 'QUARTERLY' THEN 91
             WHEN 'YEARLY' THEN 365
             ELSE 30
           END::text AS period
    FROM goals g
    LEFT JOIN goal_contributions c ON c."goalId" = g.id
    WHERE g."deletedAt" IS NULL
      AND g.status = 'ACTIVE'
      AND g."contributionMinor" IS NOT NULL
      AND g."contributionMinor" > 0
    GROUP BY g.id
  `);

  const today = todayInTimezone("UTC");
  return result.rows
    .map((r) => ({
      userId: r.userId,
      goalId: r.id,
      name: r.name,
      amountMinor: BigInt(r.contributionMinor),
      currency: r.currency,
      daysOverdue: Number(r.daysSince) - Number(r.period),
      // One reminder per target per day.
      dedupeKey: `savings-deposit:${r.id}:${today}`,
    }))
    .filter((r) => r.daysOverdue > 0);
}

