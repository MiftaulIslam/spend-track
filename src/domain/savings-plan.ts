/**
 * Savings targets — "I want a ₹5,00,000 bike; how long does that take?"
 *
 * The goal module answers the question from the other end: you name a date, it
 * tells you what to put aside. This module answers the question people actually
 * ask first — you name what you can put aside, it tells you when you get the
 * thing. Both directions are here, because every plan gets argued over from
 * both ends.
 *
 * Two rules run through all of it:
 *
 *   * The arithmetic is exact. Amounts are integer minor units, the period
 *     count comes from integer ceiling division, and the final deposit is
 *     whatever is actually left — not a full contribution that overshoots.
 *
 *   * A plan is checked against what the person really has spare. Saying
 *     "₹20,000 a month" is easy; the app already knows their income and their
 *     spending, so a plan that needs more than their surplus is reported as
 *     such rather than quietly accepted. That check is the whole reason to
 *     build this inside a finance app rather than in a spreadsheet.
 */

import {
  type Money,
  divRoundHalfAway,
  money,
  multiply,
  subtract,
  zero,
} from "./money";
import { addDays, addMonthsClamped, startOfUtcDay } from "./schedule";

export type SavingsFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

/** How a plan stands against what the person can actually spare. */
export type PlanVerdict =
  /** Already funded. */
  | "COMPLETE"
  /** The contribution fits comfortably inside the measured surplus. */
  | "COMFORTABLE"
  /** It fits, but leaves little room. */
  | "TIGHT"
  /** It exceeds the measured surplus — the date will slip. */
  | "BEYOND_MEANS"
  /** No contribution, so it never completes. */
  | "STALLED";

export interface SavingsPlanInput {
  /** What the thing costs. */
  target: Money;
  /** What has been put aside so far. */
  saved: Money;
  /** What the person says they will add each period. */
  contribution: Money;
  frequency?: SavingsFrequency;
  /**
   * Typical money left over each month, measured from the ledger. Optional —
   * without it the plan is still computed, just not judged.
   */
  monthlySurplus?: Money | null;
}

export interface SavingsPlan {
  target: Money;
  saved: Money;
  remaining: Money;
  /** 0…1, clamped. */
  fraction: number;
  /** Whole deposits still to make, including the final partial one. */
  periodsRemaining: number;
  /** The same figure in months, for the sentence the UI writes. */
  monthsRemaining: number;
  /** When the last deposit lands. Null when the plan never completes. */
  completionDate: Date | null;
  /** The last deposit, which is usually smaller than the rest. */
  finalDeposit: Money;
  /** contribution × (periods − 1) + finalDeposit. Equals `remaining` exactly. */
  totalToDeposit: Money;
  verdict: PlanVerdict;
  /**
   * What the plan needs each month, expressed monthly whatever the frequency,
   * so it can be compared against the surplus.
   */
  monthlyEquivalent: Money;
  /** Monthly shortfall against the surplus; zero when it fits. */
  monthlyShortfall: Money;
}

/** Periods per year, for converting any frequency to a monthly figure. */
const PERIODS_PER_YEAR: Record<SavingsFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
};

/** Mean days in a period. Only used to place a date, never to divide money. */
const DAYS_PER_PERIOD: Record<SavingsFrequency, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30.44,
  QUARTERLY: 91.31,
  YEARLY: 365.25,
};

/** Ceiling division on integers — no float, so no off-by-one at the boundary. */
function divCeil(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("divCeil: denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Work out how long a target takes at a stated contribution.
 *
 * The period count is a ceiling: five deposits of ₹1,000 against ₹4,200 is five
 * deposits, not 4.2. The last one is ₹200 — `finalDeposit` — because telling
 * someone to deposit a full ₹1,000 at the end would overshoot the target and
 * make the totals stop reconciling.
 */
export function planFor(input: SavingsPlanInput, now: Date = new Date()): SavingsPlan {
  const currency = input.target.currency;
  const frequency = input.frequency ?? "MONTHLY";
  const today = startOfUtcDay(now);

  const remainingRaw = subtract(input.target, input.saved);
  const remaining = remainingRaw.minor < 0n ? zero(currency) : remainingRaw;

  const fraction =
    input.target.minor <= 0n
      ? 1
      : Math.min(1, Math.max(0, Number(input.saved.minor) / Number(input.target.minor)));

  // Already there.
  if (remaining.minor === 0n) {
    return {
      target: input.target,
      saved: input.saved,
      remaining,
      fraction: 1,
      periodsRemaining: 0,
      monthsRemaining: 0,
      completionDate: today,
      finalDeposit: zero(currency),
      totalToDeposit: zero(currency),
      verdict: "COMPLETE",
      monthlyEquivalent: zero(currency),
      monthlyShortfall: zero(currency),
    };
  }

  // Nothing going in means it never arrives. Saying so is more useful than
  // returning a date decades away or dividing by zero.
  if (input.contribution.minor <= 0n) {
    return {
      target: input.target,
      saved: input.saved,
      remaining,
      fraction,
      periodsRemaining: Infinity,
      monthsRemaining: Infinity,
      completionDate: null,
      finalDeposit: zero(currency),
      totalToDeposit: remaining,
      verdict: "STALLED",
      monthlyEquivalent: zero(currency),
      monthlyShortfall: zero(currency),
    };
  }

  const periods = Number(divCeil(remaining.minor, input.contribution.minor));
  const fullDeposits = BigInt(periods - 1) * input.contribution.minor;
  const finalDeposit = money(remaining.minor - fullDeposits, currency);

  const completionDate =
    frequency === "MONTHLY" || frequency === "QUARTERLY" || frequency === "YEARLY"
      ? addMonthsClamped(today, Math.ceil(periods * (12 / PERIODS_PER_YEAR[frequency])))
      : addDays(today, Math.ceil(periods * DAYS_PER_PERIOD[frequency]));

  const monthsRemaining = Math.ceil((periods * 12) / PERIODS_PER_YEAR[frequency]);

  // The contribution restated per month, so a weekly plan and a monthly budget
  // can be compared at all.
  const monthlyEquivalent = multiply(
    input.contribution,
    BigInt(PERIODS_PER_YEAR[frequency]),
    12n,
  );

  const surplus = input.monthlySurplus ?? null;
  const shortfallRaw = surplus ? subtract(monthlyEquivalent, surplus) : zero(currency);
  const monthlyShortfall = shortfallRaw.minor > 0n ? shortfallRaw : zero(currency);

  return {
    target: input.target,
    saved: input.saved,
    remaining,
    fraction,
    periodsRemaining: periods,
    monthsRemaining,
    completionDate,
    finalDeposit,
    totalToDeposit: remaining,
    verdict: verdictFor(monthlyEquivalent, surplus),
    monthlyEquivalent,
    monthlyShortfall,
  };
}

/**
 * Judge a plan against measured surplus.
 *
 * "Tight" starts at 80% of surplus: a plan that consumes everything spare works
 * on paper and fails the first month something unexpected happens.
 */
function verdictFor(monthlyEquivalent: Money, surplus: Money | null): PlanVerdict {
  if (!surplus || surplus.minor <= 0n) {
    // No measurement to judge against — or nothing spare at all, in which case
    // any plan is beyond means.
    return surplus && surplus.minor <= 0n ? "BEYOND_MEANS" : "COMFORTABLE";
  }
  if (monthlyEquivalent.minor > surplus.minor) return "BEYOND_MEANS";
  if (monthlyEquivalent.minor * 100n > surplus.minor * 80n) return "TIGHT";
  return "COMFORTABLE";
}

/**
 * The other direction: a date is fixed, so what does each period have to be?
 *
 * Rounds **up** to the minor unit. Rounding down would leave the target short
 * by a few units on the final deposit, which is the kind of error that makes
 * someone distrust every other number on the page.
 */
export function contributionFor(
  input: { target: Money; saved: Money; by: Date; frequency?: SavingsFrequency },
  now: Date = new Date(),
): { perPeriod: Money; periods: number; feasible: boolean } {
  const currency = input.target.currency;
  const frequency = input.frequency ?? "MONTHLY";
  const today = startOfUtcDay(now);
  const deadline = startOfUtcDay(input.by);

  const remainingRaw = subtract(input.target, input.saved);
  const remaining = remainingRaw.minor < 0n ? zero(currency) : remainingRaw;
  if (remaining.minor === 0n) {
    return { perPeriod: zero(currency), periods: 0, feasible: true };
  }

  const days = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) {
    // The date has passed, so the whole remainder is due now.
    return { perPeriod: remaining, periods: 1, feasible: false };
  }

  const periods = Math.max(1, Math.floor(days / DAYS_PER_PERIOD[frequency]));
  return {
    perPeriod: money(divCeil(remaining.minor, BigInt(periods)), currency),
    periods,
    feasible: true,
  };
}

/**
 * What a deposit does to a plan.
 *
 * Returns the amount that actually counts towards the target: paying ₹5,000
 * into a plan that needs ₹800 more applies ₹800 and reports ₹4,200 as excess,
 * so the caller can refuse it, cap it, or let it overflow deliberately. Silently
 * recording an over-payment makes "saved" exceed "target" and every percentage
 * on the screen wrong.
 */
export function applyDeposit(
  plan: Pick<SavingsPlan, "remaining">,
  deposit: Money,
): { applied: Money; excess: Money; completes: boolean } {
  const currency = deposit.currency;
  if (deposit.minor <= 0n) {
    return { applied: zero(currency), excess: zero(currency), completes: false };
  }
  if (deposit.minor >= plan.remaining.minor) {
    return {
      applied: plan.remaining,
      excess: money(deposit.minor - plan.remaining.minor, currency),
      completes: true,
    };
  }
  return { applied: deposit, excess: zero(currency), completes: false };
}

/**
 * The deposit schedule, for the UI to draw and for a reminder job to read.
 *
 * Every entry carries a running total, so the list reconciles to the target on
 * its own rather than trusting the caller to add it up the same way.
 */
export function depositSchedule(
  plan: SavingsPlan,
  frequency: SavingsFrequency = "MONTHLY",
  now: Date = new Date(),
  limit = 60,
): Array<{ index: number; on: Date; amount: Money; runningTotal: Money }> {
  if (!Number.isFinite(plan.periodsRemaining) || plan.periodsRemaining === 0) return [];

  const today = startOfUtcDay(now);
  const out: Array<{ index: number; on: Date; amount: Money; runningTotal: Money }> = [];
  const count = Math.min(plan.periodsRemaining, limit);
  const perPeriod = money(
    plan.periodsRemaining === 1
      ? plan.finalDeposit.minor
      : (plan.remaining.minor - plan.finalDeposit.minor) / BigInt(plan.periodsRemaining - 1),
    plan.target.currency,
  );

  let running = plan.saved.minor;
  for (let i = 1; i <= count; i++) {
    const isLast = i === plan.periodsRemaining;
    const amount = isLast ? plan.finalDeposit : perPeriod;
    running += amount.minor;
    out.push({
      index: i,
      on:
        frequency === "MONTHLY" || frequency === "QUARTERLY" || frequency === "YEARLY"
          ? addMonthsClamped(today, Math.round(i * (12 / PERIODS_PER_YEAR[frequency])))
          : addDays(today, Math.round(i * DAYS_PER_PERIOD[frequency])),
      amount,
      runningTotal: money(running, plan.target.currency),
    });
  }
  return out;
}

/**
 * A plain-language summary. Kept here rather than in a component so the same
 * sentence can go in a notification, the assistant's answer and the page.
 */
export function describePlan(plan: SavingsPlan): string {
  if (plan.verdict === "COMPLETE") return "Fully funded.";
  if (plan.verdict === "STALLED") return "No contribution set, so this never completes.";

  const months = plan.monthsRemaining;
  const when =
    months === 1 ? "about a month" : months < 12 ? `about ${months} months` : monthsAsYears(months);

  if (plan.verdict === "BEYOND_MEANS") {
    return `${when} — but this is more than you usually have spare.`;
  }
  if (plan.verdict === "TIGHT") return `${when}, using most of what you have spare.`;
  return `${when}.`;
}

function monthsAsYears(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return years === 1 ? "about a year" : `about ${years} years`;
  return `about ${years}y ${rest}m`;
}

/** Contribution needed to finish `months` sooner, for the "what if" control. */
export function contributionToSave(
  plan: SavingsPlan,
  monthsSooner: number,
  frequency: SavingsFrequency = "MONTHLY",
): Money | null {
  if (!Number.isFinite(plan.periodsRemaining)) return null;
  const targetMonths = plan.monthsRemaining - monthsSooner;
  if (targetMonths <= 0) return plan.remaining;

  const periods = Math.max(1, Math.floor((targetMonths * PERIODS_PER_YEAR[frequency]) / 12));
  return money(divCeil(plan.remaining.minor, BigInt(periods)), plan.target.currency);
}

/** Exposed for the service layer, which reports the same figure to the UI. */
export { divCeil as ceilDivide, divRoundHalfAway };
