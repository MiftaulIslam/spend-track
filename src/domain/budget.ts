/**
 * Budget mathematics.
 *
 * The interesting idea here is the **pace marker**: a budget with 85% spent is
 * healthy on day 28 and alarming on day 5. Every number a budget surface shows
 * is relative to how much of the period has actually elapsed.
 */

import { type Money, add, subtract, zero, divRoundHalfAway, isNegative } from "./money";
import { type PeriodWindow, elapsedFraction } from "./schedule";

export type BudgetHealth = "UNDER" | "ON_TRACK" | "AT_RISK" | "OVER" | "ALLOCATED";

export interface BudgetLineInput {
  categoryId: string;
  limit: Money;
  /** Carried in from the previous period when rollover is enabled. */
  rollover?: Money;
  spent: Money;
  /**
   * A fixed cost paid in one lump — rent, insurance, a loan payment.
   *
   * Pace is meaningless for these: rent is 100% "used" the moment it posts on
   * the 1st, which the pace marker would read as 47 points ahead of schedule
   * and flag as at-risk every month. A fixed line is judged only on whether it
   * exceeded its limit.
   */
  fixed?: boolean;
}

export interface BudgetLineResult {
  categoryId: string;
  fixed: boolean;
  limit: Money;
  effectiveLimit: Money;
  spent: Money;
  remaining: Money;
  /** 0…∞ — can exceed 1 when over budget. */
  usedFraction: number;
  /** usedFraction − elapsedFraction. Positive means spending ahead of pace. */
  paceDelta: number;
  health: BudgetHealth;
  /** Straight-line extrapolation to the period end. */
  projected: Money;
  projectedOverrun: Money;
}

export interface BudgetSummary {
  window: PeriodWindow;
  elapsedFraction: number;
  daysRemaining: number;
  totalLimit: Money;
  totalSpent: Money;
  totalRemaining: Money;
  usedFraction: number;
  paceDelta: number;
  health: BudgetHealth;
  projected: Money;
  projectedOverrun: Money;
  lines: BudgetLineResult[];
}

/** Ratio as a plain number, for UI only — never fed back into an amount. */
function ratio(numerator: Money, denominator: Money): number {
  if (denominator.minor === 0n) return numerator.minor === 0n ? 0 : Infinity;
  return Number(numerator.minor) / Number(denominator.minor);
}

/**
 * Health bands. `AT_RISK` is deliberately pace-relative rather than a fixed
 * percentage: being at 60% on day 3 is worse than being at 90% on day 29.
 *
 * A fixed line skips the pace comparison entirely — see `BudgetLineInput.fixed`.
 */
function classify(usedFraction: number, elapsed: number, fixed = false): BudgetHealth {
  if (usedFraction > 1.0005) return "OVER";
  // A fixed cost that has not posted yet is not "on track" — there is simply
  // nothing to act on, so it ranks with the under-spent lines and stays out of
  // the way of the ones that need attention.
  if (fixed) return usedFraction >= 0.9995 ? "ALLOCATED" : "UNDER";
  const delta = usedFraction - elapsed;
  if (delta > 0.15) return "AT_RISK";
  if (delta > 0.02) return "ON_TRACK";
  return "UNDER";
}

/** Straight-line projection of spend to the end of the period. */
function project(spent: Money, elapsed: number): Money {
  if (elapsed <= 0) return spent;
  if (elapsed >= 1) return spent;
  // spent / elapsed, kept in integer space: multiply by 1e6 then divide.
  const scale = BigInt(Math.round(elapsed * 1_000_000));
  if (scale === 0n) return spent;
  return { minor: divRoundHalfAway(spent.minor * 1_000_000n, scale), currency: spent.currency };
}

export function evaluateLine(
  line: BudgetLineInput,
  window: PeriodWindow,
  now: Date = new Date(),
  currency = line.limit.currency,
): BudgetLineResult {
  const elapsed = elapsedFraction(window, now);
  const effectiveLimit = line.rollover ? add(line.limit, line.rollover) : line.limit;
  const remaining = subtract(effectiveLimit, line.spent);
  const usedFraction = ratio(line.spent, effectiveLimit);
  const projected = project(line.spent, elapsed);
  const overrun = subtract(projected, effectiveLimit);

  return {
    categoryId: line.categoryId,
    fixed: Boolean(line.fixed),
    limit: line.limit,
    effectiveLimit,
    spent: line.spent,
    remaining,
    usedFraction,
    // A fixed line is never "ahead of pace" — it is simply paid.
    paceDelta: line.fixed ? 0 : usedFraction - elapsed,
    health: classify(usedFraction, elapsed, line.fixed),
    projected: line.fixed ? line.spent : projected,
    projectedOverrun: isNegative(overrun) ? zero(currency) : line.fixed ? zero(currency) : overrun,
  };
}

export function summarise(
  lines: readonly BudgetLineInput[],
  window: PeriodWindow,
  options: { currency: string; totalLimit?: Money | null; now?: Date },
): BudgetSummary {
  const now = options.now ?? new Date();
  const elapsed = elapsedFraction(window, now);
  const currency = options.currency;

  const evaluated = lines.map((l) => evaluateLine(l, window, now, currency));

  const summedLimit = evaluated.reduce<Money>(
    (acc, l) => add(acc, l.effectiveLimit),
    zero(currency),
  );
  const totalLimit = options.totalLimit ?? summedLimit;
  const totalSpent = evaluated.reduce<Money>((acc, l) => add(acc, l.spent), zero(currency));
  const usedFraction = ratio(totalSpent, totalLimit);

  // Project only the discretionary part forward; a fixed cost has already
  // happened in full and must not be extrapolated across the rest of the month.
  const fixedSpent = evaluated.filter((l) => l.fixed).reduce<Money>((acc, l) => add(acc, l.spent), zero(currency));
  const variableSpent = subtract(totalSpent, fixedSpent);
  const fixedLimit = evaluated.filter((l) => l.fixed).reduce<Money>((acc, l) => add(acc, l.effectiveLimit), zero(currency));
  const projected = add(fixedSpent, project(variableSpent, elapsed));
  const overrun = subtract(projected, totalLimit);

  const variableLimit = subtract(totalLimit, fixedLimit);
  const variableUsed = ratio(variableSpent, variableLimit);

  const msRemaining = Math.max(0, window.end.getTime() - now.getTime());

  return {
    window,
    elapsedFraction: elapsed,
    daysRemaining: Math.ceil(msRemaining / 86_400_000),
    totalLimit,
    totalSpent,
    totalRemaining: subtract(totalLimit, totalSpent),
    usedFraction,
    // Pace is judged on the discretionary portion, which is the only part a
    // person can still change.
    paceDelta: variableUsed - elapsed,
    health: classify(variableUsed, elapsed),
    projected,
    projectedOverrun: isNegative(overrun) ? zero(currency) : overrun,
    lines: evaluated,
  };
}

/**
 * Rollover carried into the next period.
 *
 * Underspend carries forward; overspend carries forward as a **negative**
 * rollover, so a blown month tightens the next one instead of vanishing. That
 * is the whole point of rollover budgeting — the alternative lets a user
 * overspend every month with no consequence.
 */
export function computeRollover(previous: BudgetLineResult): Money {
  return previous.remaining;
}

/**
 * Suggest a limit from history. Uses the **median** of the trailing periods
 * rather than the mean, because one holiday month should not permanently
 * inflate a grocery budget. Rounded up to a tidy figure so the number reads
 * like a decision rather than an average.
 */
export function suggestLimit(history: readonly Money[], currency: string): Money {
  if (history.length === 0) return zero(currency);
  const sorted = [...history].map((m) => m.minor).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2n : sorted[mid];

  // Round up to the nearest 10 major units (e.g. nearest $10).
  const step = 1000n; // 10 major units in minor units for a 2-dp currency
  const rounded = median <= 0n ? 0n : ((median + step - 1n) / step) * step;
  return { minor: rounded, currency };
}

/** Which alert thresholds a line has newly crossed, given what already fired. */
export function crossedThresholds(
  usedFraction: number,
  thresholds: readonly number[],
  alreadyFired: readonly number[],
): number[] {
  const pct = usedFraction * 100;
  return thresholds
    .filter((t) => pct >= t && !alreadyFired.includes(t))
    .sort((a, b) => a - b);
}
