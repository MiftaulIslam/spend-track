/**
 * Goal mathematics — progress, required contribution, projected completion.
 *
 * Progress is computed from **actual contributions**, never from a stored
 * "current amount" field. A number a user can edit directly is a number that
 * drifts from the transactions that produced it.
 */

import { type Money, add, divRoundHalfAway, subtract, zero } from "./money";
import { addDays, addMonthsClamped, startOfUtcDay } from "./schedule";

export type GoalPace = "AHEAD" | "ON_TRACK" | "BEHIND" | "UNREACHABLE" | "COMPLETE";

export interface GoalInput {
  target: Money;
  saved: Money;
  targetDate?: Date | null;
  /** What the user says they will put in each period. */
  contribution?: Money | null;
  contributionFrequency?: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
}

export interface GoalProgress {
  target: Money;
  saved: Money;
  remaining: Money;
  /** 0…1, clamped. */
  fraction: number;
  daysRemaining: number | null;
  /** What must be contributed each period to hit the date. */
  requiredPerPeriod: Money | null;
  /** Where the current plan actually lands. */
  projectedCompletion: Date | null;
  pace: GoalPace;
  /** Positive = the plan finishes this many days early. */
  daysAheadOfPlan: number | null;
}

const PERIODS_PER_YEAR = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
} as const;

const DAYS_PER_PERIOD = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30.44,
  QUARTERLY: 91.31,
  YEARLY: 365.25,
} as const;

export function evaluate(goal: GoalInput, now: Date = new Date()): GoalProgress {
  const currency = goal.target.currency;
  const remainingRaw = subtract(goal.target, goal.saved);
  const remaining = remainingRaw.minor < 0n ? zero(currency) : remainingRaw;

  const fraction =
    goal.target.minor <= 0n
      ? 1
      : Math.min(1, Math.max(0, Number(goal.saved.minor) / Number(goal.target.minor)));

  const today = startOfUtcDay(now);
  const daysRemaining = goal.targetDate
    ? Math.ceil((startOfUtcDay(goal.targetDate).getTime() - today.getTime()) / 86_400_000)
    : null;

  if (remaining.minor <= 0n) {
    return {
      target: goal.target,
      saved: goal.saved,
      remaining: zero(currency),
      fraction: 1,
      daysRemaining,
      requiredPerPeriod: zero(currency),
      projectedCompletion: today,
      pace: "COMPLETE",
      daysAheadOfPlan: daysRemaining,
    };
  }

  const freq = goal.contributionFrequency ?? "MONTHLY";
  const daysPerPeriod = DAYS_PER_PERIOD[freq];

  // What the deadline demands.
  let requiredPerPeriod: Money | null = null;
  if (daysRemaining !== null) {
    if (daysRemaining <= 0) {
      requiredPerPeriod = remaining;
    } else {
      const periods = Math.max(1, Math.floor(daysRemaining / daysPerPeriod));
      requiredPerPeriod = {
        minor: divRoundHalfAway(remaining.minor, BigInt(periods)),
        currency,
      };
    }
  }

  // Where the stated plan lands.
  let projectedCompletion: Date | null = null;
  if (goal.contribution && goal.contribution.minor > 0n) {
    const periodsNeeded = Number(
      (remaining.minor + goal.contribution.minor - 1n) / goal.contribution.minor,
    );
    projectedCompletion =
      freq === "MONTHLY" || freq === "QUARTERLY" || freq === "YEARLY"
        ? addMonthsClamped(today, Math.ceil(periodsNeeded * (12 / PERIODS_PER_YEAR[freq])))
        : addDays(today, Math.ceil(periodsNeeded * daysPerPeriod));
  }

  let pace: GoalPace = "ON_TRACK";
  let daysAheadOfPlan: number | null = null;

  if (goal.targetDate && projectedCompletion) {
    const deadline = startOfUtcDay(goal.targetDate);
    daysAheadOfPlan = Math.round((deadline.getTime() - projectedCompletion.getTime()) / 86_400_000);
    if (daysAheadOfPlan > 14) pace = "AHEAD";
    else if (daysAheadOfPlan >= -3) pace = "ON_TRACK";
    else pace = "BEHIND";
  } else if (goal.targetDate && !goal.contribution) {
    pace = daysRemaining !== null && daysRemaining < 0 ? "UNREACHABLE" : "ON_TRACK";
  }

  if (daysRemaining !== null && daysRemaining <= 0 && remaining.minor > 0n) pace = "UNREACHABLE";

  return {
    target: goal.target,
    saved: goal.saved,
    remaining,
    fraction,
    daysRemaining,
    requiredPerPeriod,
    projectedCompletion,
    pace,
    daysAheadOfPlan,
  };
}

export interface MilestoneInput {
  id: string;
  name: string;
  amount: Money;
}

export interface MilestoneProgress extends MilestoneInput {
  reached: boolean;
  /** 0…1 progress through this milestone specifically. */
  fraction: number;
  /** Cumulative amount at which this milestone completes. */
  cumulative: Money;
}

/**
 * Milestones are consumed in order: the first N that the saved amount covers
 * are complete, and the next one shows partial progress. Treating them as
 * independent percentages of the whole goal reads wrong — a user thinks
 * "flights are paid for", not "flights are 80% of 20% of the goal".
 */
export function evaluateMilestones(
  milestones: readonly MilestoneInput[],
  saved: Money,
): MilestoneProgress[] {
  const currency = saved.currency;
  let consumed = zero(currency);
  let remaining = saved;

  return milestones.map((m) => {
    consumed = add(consumed, m.amount);
    const applied = remaining.minor >= m.amount.minor ? m.amount : remaining;
    const fraction =
      m.amount.minor <= 0n ? 1 : Math.min(1, Math.max(0, Number(applied.minor) / Number(m.amount.minor)));
    remaining = subtract(remaining, applied);
    if (remaining.minor < 0n) remaining = zero(currency);

    return { ...m, reached: fraction >= 1, fraction, cumulative: consumed };
  });
}

/** Projected balance at each future period, for the goals chart. */
export function projectSeries(
  goal: GoalInput,
  periods: number,
  now: Date = new Date(),
): Array<{ date: Date; amount: Money }> {
  const currency = goal.target.currency;
  const contribution = goal.contribution ?? zero(currency);
  const freq = goal.contributionFrequency ?? "MONTHLY";
  const out: Array<{ date: Date; amount: Money }> = [];
  let running = goal.saved;
  const today = startOfUtcDay(now);

  for (let i = 0; i <= periods; i++) {
    const date =
      freq === "MONTHLY" || freq === "QUARTERLY" || freq === "YEARLY"
        ? addMonthsClamped(today, i * (12 / PERIODS_PER_YEAR[freq]))
        : addDays(today, Math.round(i * DAYS_PER_PERIOD[freq]));
    out.push({ date, amount: running });
    running = add(running, contribution);
    if (running.minor > goal.target.minor) running = goal.target;
  }
  return out;
}
