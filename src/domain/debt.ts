/**
 * Debt mathematics — amortisation and payoff strategies.
 *
 * Interest is computed in integer minor units with a single rounding step per
 * period, which is what a lender's own system does. A float-based amortisation
 * drifts by a few cents per year and then the final payment doesn't clear the
 * balance, which is exactly the bug users notice.
 */

import { type Money, add, divRoundHalfAway, money, subtract, zero } from "./money";

export interface DebtInput {
  id: string;
  name: string;
  balance: Money;
  /** Annual percentage rate in basis points. 2474 = 24.74%. */
  aprBps: number;
  minimumPayment: Money;
}

export interface AmortisationRow {
  period: number;
  payment: Money;
  interest: Money;
  principal: Money;
  balanceAfter: Money;
}

export interface PayoffResult {
  months: number;
  totalPaid: Money;
  totalInterest: Money;
  payoffDate: Date;
  schedule: AmortisationRow[];
}

const MAX_PERIODS = 720; // 60 years — a guard, not a business rule

/** One month's interest at the given APR, rounded once. */
export function monthlyInterest(balance: Money, aprBps: number): Money {
  if (aprBps <= 0 || balance.minor <= 0n) return zero(balance.currency);
  // balance * apr / 10000 / 12
  return {
    minor: divRoundHalfAway(balance.minor * BigInt(Math.round(aprBps)), 120_000n),
    currency: balance.currency,
  };
}

/** Split a payment into interest first, then principal — standard for consumer debt. */
export function splitPayment(
  balance: Money,
  aprBps: number,
  payment: Money,
): { interest: Money; principal: Money; balanceAfter: Money; shortfall: Money } {
  const interest = monthlyInterest(balance, aprBps);
  const currency = balance.currency;

  if (payment.minor <= interest.minor) {
    // The payment does not even cover interest — the balance grows.
    const shortfall = subtract(interest, payment);
    return {
      interest,
      principal: zero(currency),
      balanceAfter: add(balance, shortfall),
      shortfall,
    };
  }

  const principalRaw = subtract(payment, interest);
  // The final payment must not overshoot the balance.
  const principal =
    principalRaw.minor > balance.minor ? { minor: balance.minor, currency } : principalRaw;

  return {
    interest,
    principal,
    balanceAfter: subtract(balance, principal),
    shortfall: zero(currency),
  };
}

/**
 * Amortise one debt at a fixed monthly payment.
 * Returns null when the payment never clears the balance (payment ≤ interest).
 */
export function amortise(
  debt: DebtInput,
  monthlyPayment: Money,
  startDate: Date = new Date(),
): PayoffResult | null {
  const currency = debt.balance.currency;
  let balance = debt.balance;
  let totalInterest = zero(currency);
  let totalPaid = zero(currency);
  const schedule: AmortisationRow[] = [];

  for (let period = 1; period <= MAX_PERIODS; period++) {
    if (balance.minor <= 0n) break;

    const cap = add(balance, monthlyInterest(balance, debt.aprBps));
    const payment = monthlyPayment.minor > cap.minor ? cap : monthlyPayment;
    const split = splitPayment(balance, debt.aprBps, payment);

    if (split.principal.minor <= 0n && split.shortfall.minor > 0n) return null;

    balance = split.balanceAfter;
    totalInterest = add(totalInterest, split.interest);
    totalPaid = add(totalPaid, payment);
    schedule.push({
      period,
      payment,
      interest: split.interest,
      principal: split.principal,
      balanceAfter: balance,
    });

    if (balance.minor <= 0n) break;
  }

  if (balance.minor > 0n) return null;

  const payoffDate = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + schedule.length, startDate.getUTCDate()),
  );

  return { months: schedule.length, totalPaid, totalInterest, payoffDate, schedule };
}

export type PayoffStrategy = "AVALANCHE" | "SNOWBALL" | "CUSTOM";

export interface StrategyResult {
  strategy: PayoffStrategy;
  order: string[];
  months: number;
  totalInterest: Money;
  totalPaid: Money;
  payoffDate: Date;
  perDebt: Array<{ id: string; name: string; months: number; interest: Money }>;
}

/**
 * Multi-debt payoff.
 *
 * Every debt gets its minimum; the surplus goes entirely to the first debt in
 * strategy order. When one clears, its minimum **plus** the surplus rolls onto
 * the next — that cascade is the whole mechanism, and it's why both strategies
 * beat paying minimums.
 */
export function simulateStrategy(
  debts: readonly DebtInput[],
  monthlyBudget: Money,
  strategy: PayoffStrategy,
  customOrder: readonly string[] = [],
  startDate: Date = new Date(),
): StrategyResult | null {
  if (debts.length === 0) return null;
  const currency = monthlyBudget.currency;

  const order = orderDebts(debts, strategy, customOrder);
  const state = new Map<string, Money>(debts.map((d) => [d.id, d.balance]));
  const interestByDebt = new Map<string, Money>(debts.map((d) => [d.id, zero(currency)]));
  const clearedAt = new Map<string, number>();
  const byId = new Map(debts.map((d) => [d.id, d]));

  let totalInterest = zero(currency);
  let totalPaid = zero(currency);
  let month = 0;

  while (month < MAX_PERIODS) {
    const outstanding = order.filter((id) => (state.get(id)?.minor ?? 0n) > 0n);
    if (outstanding.length === 0) break;
    month++;

    // Minimums first, capped at what each debt actually needs this month.
    let available = monthlyBudget;
    const plan = new Map<string, Money>();

    for (const id of outstanding) {
      const debt = byId.get(id)!;
      const balance = state.get(id)!;
      const need = add(balance, monthlyInterest(balance, debt.aprBps));
      const min = debt.minimumPayment.minor > need.minor ? need : debt.minimumPayment;
      const pay = min.minor > available.minor ? available : min;
      plan.set(id, pay);
      available = subtract(available, pay);
    }

    // Surplus cascades down the strategy order.
    for (const id of outstanding) {
      if (available.minor <= 0n) break;
      const debt = byId.get(id)!;
      const balance = state.get(id)!;
      const need = add(balance, monthlyInterest(balance, debt.aprBps));
      const already = plan.get(id)!;
      const room = subtract(need, already);
      if (room.minor <= 0n) continue;
      const extra = room.minor > available.minor ? available : room;
      plan.set(id, add(already, extra));
      available = subtract(available, extra);
    }

    let anyProgress = false;
    for (const id of outstanding) {
      const debt = byId.get(id)!;
      const balance = state.get(id)!;
      const payment = plan.get(id)!;
      const split = splitPayment(balance, debt.aprBps, payment);

      state.set(id, split.balanceAfter);
      interestByDebt.set(id, add(interestByDebt.get(id)!, split.interest));
      totalInterest = add(totalInterest, split.interest);
      totalPaid = add(totalPaid, payment);

      if (split.principal.minor > 0n) anyProgress = true;
      if (split.balanceAfter.minor <= 0n && !clearedAt.has(id)) clearedAt.set(id, month);
    }

    // The budget cannot service the interest — this plan never terminates.
    if (!anyProgress) return null;
  }

  if (order.some((id) => (state.get(id)?.minor ?? 0n) > 0n)) return null;

  return {
    strategy,
    order,
    months: month,
    totalInterest,
    totalPaid,
    payoffDate: new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + month, startDate.getUTCDate()),
    ),
    perDebt: order.map((id) => ({
      id,
      name: byId.get(id)!.name,
      months: clearedAt.get(id) ?? month,
      interest: interestByDebt.get(id)!,
    })),
  };
}

function orderDebts(
  debts: readonly DebtInput[],
  strategy: PayoffStrategy,
  customOrder: readonly string[],
): string[] {
  if (strategy === "CUSTOM" && customOrder.length) {
    const known = new Set(debts.map((d) => d.id));
    const picked = customOrder.filter((id) => known.has(id));
    return [...picked, ...debts.map((d) => d.id).filter((id) => !picked.includes(id))];
  }
  const sorted = [...debts];
  if (strategy === "SNOWBALL") {
    sorted.sort((a, b) => (a.balance.minor < b.balance.minor ? -1 : a.balance.minor > b.balance.minor ? 1 : 0));
  } else {
    sorted.sort((a, b) => b.aprBps - a.aprBps);
  }
  return sorted.map((d) => d.id);
}

/** Weighted-average APR across a debt portfolio, in basis points. */
export function weightedApr(debts: readonly DebtInput[]): number {
  const total = debts.reduce((acc, d) => acc + d.balance.minor, 0n);
  if (total === 0n) return 0;
  const weighted = debts.reduce(
    (acc, d) => acc + d.balance.minor * BigInt(Math.round(d.aprBps)),
    0n,
  );
  return Number(divRoundHalfAway(weighted, total));
}

/** Minimum monthly payment that clears every debt — the floor for a plan. */
export function totalMinimum(debts: readonly DebtInput[], currency: string): Money {
  return debts.reduce<Money>((acc, d) => add(acc, d.minimumPayment), zero(currency));
}

export { money as _money };
