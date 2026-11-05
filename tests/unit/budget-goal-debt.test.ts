import { describe, expect, it } from "vitest";
import { parseAmount, sum, toDecimalString, zero } from "@/src/domain/money";
import { periodFor, utcDate } from "@/src/domain/schedule";
import {
  computeRollover,
  crossedThresholds,
  evaluateLine,
  suggestLimit,
  summarise,
} from "@/src/domain/budget";
import { evaluate as evaluateGoal, evaluateMilestones, projectSeries } from "@/src/domain/goal";
import {
  amortise,
  monthlyInterest,
  simulateStrategy,
  splitPayment,
  totalMinimum,
  weightedApr,
} from "@/src/domain/debt";

const usd = (s: string) => parseAmount(s, "USD");
const SEPT = periodFor("MONTHLY", utcDate(2025, 8, 17));
const DAY_17 = utcDate(2025, 8, 17); // 53.3% through September

/* ────────────────────────────────────────────────────────────── budgets ── */

describe("budget pace", () => {
  it("calls 85% used at 53% elapsed 'at risk', not 'on track'", () => {
    // A budget number without a pace marker is meaningless — this is the test
    // that keeps the distinction honest.
    const line = evaluateLine(
      { categoryId: "groceries", limit: usd("600.00"), spent: usd("512.40") },
      SEPT,
      DAY_17,
    );
    expect(line.usedFraction).toBeCloseTo(0.854, 3);
    expect(line.paceDelta).toBeGreaterThan(0.15);
    expect(line.health).toBe("AT_RISK");
  });

  it("stops calling the same 85% 'at risk' near the end of the period", () => {
    // 85% used with 87% of the month gone is fine; the number did not change,
    // only where in the period it sits.
    const line = evaluateLine(
      { categoryId: "groceries", limit: usd("600.00"), spent: usd("512.40") },
      SEPT,
      utcDate(2025, 8, 27),
    );
    expect(line.health).toBe("UNDER");
    expect(line.paceDelta).toBeLessThan(0);
  });

  it("marks anything past the limit as over", () => {
    const line = evaluateLine(
      { categoryId: "dining", limit: usd("280.00"), spent: usd("348.15") },
      SEPT,
      DAY_17,
    );
    expect(line.health).toBe("OVER");
    expect(toDecimalString(line.remaining)).toBe("-68.15");
  });

  it("adds rollover to the effective limit", () => {
    const line = evaluateLine(
      { categoryId: "dining", limit: usd("280.00"), rollover: usd("40.00"), spent: usd("300.00") },
      SEPT,
      DAY_17,
    );
    expect(toDecimalString(line.effectiveLimit)).toBe("320.00");
    expect(toDecimalString(line.remaining)).toBe("20.00");
    expect(line.health).not.toBe("OVER");
  });

  it("projects spend to the period end", () => {
    const line = evaluateLine(
      { categoryId: "dining", limit: usd("280.00"), spent: usd("160.00") },
      SEPT,
      utcDate(2025, 8, 16), // exactly half the month
    );
    expect(Number(toDecimalString(line.projected))).toBeCloseTo(320, 0);
    expect(Number(toDecimalString(line.projectedOverrun))).toBeCloseTo(40, 0);
  });

  it("reports no overrun when the projection lands under", () => {
    const line = evaluateLine(
      { categoryId: "transport", limit: usd("220.00"), spent: usd("96.50") },
      SEPT,
      DAY_17,
    );
    expect(line.projectedOverrun.minor).toBe(0n);
  });

  it("summarises across lines", () => {
    const s = summarise(
      [
        { categoryId: "dining", limit: usd("280.00"), spent: usd("348.15") },
        { categoryId: "groceries", limit: usd("600.00"), spent: usd("512.40") },
        { categoryId: "transport", limit: usd("220.00"), spent: usd("96.50") },
      ],
      SEPT,
      { currency: "USD", now: DAY_17 },
    );
    expect(toDecimalString(s.totalLimit)).toBe("1100.00");
    expect(toDecimalString(s.totalSpent)).toBe("957.05");
    expect(s.lines).toHaveLength(3);
    expect(s.daysRemaining).toBe(14);
  });

  it("honours an explicit overall limit over the sum of lines", () => {
    const s = summarise(
      [{ categoryId: "dining", limit: usd("280.00"), spent: usd("100.00") }],
      SEPT,
      { currency: "USD", totalLimit: usd("5200.00"), now: DAY_17 },
    );
    expect(toDecimalString(s.totalLimit)).toBe("5200.00");
  });

  it("carries overspend forward as a negative rollover", () => {
    // Overspend has to bite the next period, or rollover budgeting is theatre.
    const over = evaluateLine(
      { categoryId: "dining", limit: usd("280.00"), spent: usd("348.15") },
      SEPT,
      DAY_17,
    );
    expect(toDecimalString(computeRollover(over))).toBe("-68.15");
  });

  it("suggests a limit from the median, not the mean", () => {
    // One holiday month must not permanently inflate the grocery budget.
    const history = [usd("400.00"), usd("420.00"), usd("410.00"), usd("1800.00")];
    const suggested = suggestLimit(history, "USD");
    expect(Number(toDecimalString(suggested))).toBeLessThan(500);
    expect(Number(toDecimalString(suggested))).toBeGreaterThanOrEqual(415);
  });

  it("returns zero for empty history", () => {
    expect(suggestLimit([], "USD").minor).toBe(0n);
  });

  it("does not call a fully-paid fixed cost 'at risk'", () => {
    // Rent posts in full on the 1st. Judged on pace it would look 47 points
    // ahead of schedule every single month, which is noise, not a signal.
    const line = evaluateLine(
      { categoryId: "rent", limit: usd("1650.00"), spent: usd("1650.00"), fixed: true },
      SEPT,
      DAY_17,
    );
    expect(line.health).toBe("ALLOCATED");
    expect(line.paceDelta).toBe(0);
    // And it is not extrapolated to 3x by the end of the month.
    expect(toDecimalString(line.projected)).toBe("1650.00");
    expect(line.projectedOverrun.minor).toBe(0n);
  });

  it("ranks an unposted fixed cost as nothing-to-do, not on-track", () => {
    // Rent due on the 25th, unpaid on the 17th. It must not outrank a
    // discretionary line that is genuinely running hot.
    const line = evaluateLine(
      { categoryId: "rent", limit: usd("1650.00"), spent: usd("0.00"), fixed: true },
      SEPT,
      DAY_17,
    );
    expect(line.health).toBe("UNDER");
  });

  it("still calls a fixed cost over budget when it exceeds the limit", () => {
    const line = evaluateLine(
      { categoryId: "rent", limit: usd("1650.00"), spent: usd("1700.00"), fixed: true },
      SEPT,
      DAY_17,
    );
    expect(line.health).toBe("OVER");
  });

  it("judges overall pace on the discretionary portion only", () => {
    // Rent is fully paid; dining is at 50% on day 17. A naive total would read
    // 88% used at 53% elapsed and shout; the truth is dining is on track.
    const s = summarise(
      [
        { categoryId: "rent", limit: usd("1650.00"), spent: usd("1650.00"), fixed: true },
        { categoryId: "dining", limit: usd("320.00"), spent: usd("160.00") },
      ],
      SEPT,
      { currency: "USD", now: DAY_17 },
    );
    expect(s.usedFraction).toBeCloseTo(0.92, 2);
    expect(s.health).not.toBe("AT_RISK");
    // The projection adds the paid rent to the extrapolated dining spend.
    expect(Number(toDecimalString(s.projected))).toBeCloseTo(1650 + 160 / 0.533, 0);
  });

  it("fires each threshold once", () => {
    expect(crossedThresholds(0.85, [80, 100], [])).toEqual([80]);
    expect(crossedThresholds(0.85, [80, 100], [80])).toEqual([]);
    expect(crossedThresholds(1.24, [80, 100], [80])).toEqual([100]);
  });
});

/* ──────────────────────────────────────────────────────────────── goals ── */

describe("goals", () => {
  const japan = {
    target: usd("6000.00"),
    saved: usd("3840.00"),
    targetDate: utcDate(2026, 2, 12),
    contribution: usd("400.00"),
    contributionFrequency: "MONTHLY" as const,
  };

  it("computes progress and what the deadline demands", () => {
    const p = evaluateGoal(japan, DAY_17);
    expect(p.fraction).toBeCloseTo(0.64, 2);
    expect(toDecimalString(p.remaining)).toBe("2160.00");
    expect(p.daysRemaining).toBe(176);
    expect(Number(toDecimalString(p.requiredPerPeriod!))).toBeCloseTo(432, 0);
  });

  it("projects where the stated plan lands and compares it to the deadline", () => {
    const p = evaluateGoal(japan, DAY_17);
    expect(p.projectedCompletion).not.toBeNull();
    expect(p.pace === "ON_TRACK" || p.pace === "BEHIND").toBe(true);
  });

  it("reports AHEAD when contributing well above the requirement", () => {
    const p = evaluateGoal({ ...japan, contribution: usd("1000.00") }, DAY_17);
    expect(p.pace).toBe("AHEAD");
  });

  it("reports COMPLETE once funded, with no negative remainder", () => {
    const p = evaluateGoal({ ...japan, saved: usd("6200.00") }, DAY_17);
    expect(p.pace).toBe("COMPLETE");
    expect(p.remaining.minor).toBe(0n);
    expect(p.fraction).toBe(1);
  });

  it("reports UNREACHABLE past the deadline", () => {
    const p = evaluateGoal({ ...japan, targetDate: utcDate(2025, 7, 1) }, DAY_17);
    expect(p.pace).toBe("UNREACHABLE");
  });

  it("consumes milestones in order rather than as independent percentages", () => {
    const ms = evaluateMilestones(
      [
        { id: "1", name: "Flights", amount: usd("1200.00") },
        { id: "2", name: "Rail pass", amount: usd("600.00") },
        { id: "3", name: "Lodging", amount: usd("2400.00") },
        { id: "4", name: "Spending", amount: usd("1800.00") },
      ],
      usd("3840.00"),
    );
    expect(ms.map((m) => m.reached)).toEqual([true, true, false, false]);
    expect(ms[2].fraction).toBeCloseTo(0.85, 2);
    expect(ms[3].fraction).toBe(0);
    expect(toDecimalString(ms[3].cumulative)).toBe("6000.00");
  });

  it("projects a series that never exceeds the target", () => {
    const series = projectSeries(japan, 12, DAY_17);
    expect(series).toHaveLength(13);
    expect(series[0].amount.minor).toBe(japan.saved.minor);
    expect(series.at(-1)!.amount.minor).toBe(japan.target.minor);
  });
});

/* ───────────────────────────────────────────────────────────────── debt ── */

describe("debt", () => {
  const card = {
    id: "amex",
    name: "Amex Gold",
    balance: usd("2860.40"),
    aprBps: 2474,
    minimumPayment: usd("86.00"),
  };
  const auto = {
    id: "auto",
    name: "Auto loan",
    balance: usd("12240.00"),
    aprBps: 490,
    minimumPayment: usd("384.22"),
  };

  it("computes one month of interest exactly", () => {
    // 2860.40 * 0.2474 / 12 = 58.9719... -> 58.97
    expect(toDecimalString(monthlyInterest(card.balance, card.aprBps))).toBe("58.97");
    expect(monthlyInterest(zero("USD"), 2474).minor).toBe(0n);
    expect(monthlyInterest(usd("100.00"), 0).minor).toBe(0n);
  });

  it("splits a payment interest-first", () => {
    const s = splitPayment(card.balance, card.aprBps, usd("500.00"));
    expect(toDecimalString(s.interest)).toBe("58.97");
    expect(toDecimalString(s.principal)).toBe("441.03");
    expect(toDecimalString(s.balanceAfter)).toBe("2419.37");
  });

  it("grows the balance when a payment cannot cover interest", () => {
    const s = splitPayment(card.balance, card.aprBps, usd("20.00"));
    expect(s.principal.minor).toBe(0n);
    expect(s.balanceAfter.minor).toBeGreaterThan(card.balance.minor);
    expect(toDecimalString(s.shortfall)).toBe("38.97");
  });

  it("never overshoots on the final payment", () => {
    const s = splitPayment(usd("50.00"), 2474, usd("500.00"));
    expect(s.balanceAfter.minor).toBe(0n);
    expect(toDecimalString(s.principal)).toBe("50.00");
  });

  it("amortises to exactly zero", () => {
    const r = amortise(card, usd("500.00"))!;
    expect(r).not.toBeNull();
    expect(r.schedule.at(-1)!.balanceAfter.minor).toBe(0n);
    // Principal paid must equal the original balance, to the cent.
    const principal = sum(r.schedule.map((row) => row.principal), "USD");
    expect(principal.minor).toBe(card.balance.minor);
    // And payments must equal principal + interest, to the cent.
    expect(r.totalPaid.minor).toBe(principal.minor + r.totalInterest.minor);
  });

  it("returns null when the payment never clears the debt", () => {
    expect(amortise(card, usd("20.00"))).toBeNull();
  });

  it("charges less interest on avalanche than on snowball", () => {
    const debts = [card, auto];
    const budget = usd("900.00");
    const avalanche = simulateStrategy(debts, budget, "AVALANCHE")!;
    const snowball = simulateStrategy(debts, budget, "SNOWBALL")!;

    expect(avalanche).not.toBeNull();
    expect(snowball).not.toBeNull();
    // Avalanche targets the 24.74% card first, so it must cost less interest.
    expect(avalanche.totalInterest.minor).toBeLessThanOrEqual(snowball.totalInterest.minor);
    expect(avalanche.order[0]).toBe("amex");
    expect(snowball.order[0]).toBe("amex"); // also the smallest balance here
  });

  it("clears every debt in the simulation", () => {
    const r = simulateStrategy([card, auto], usd("900.00"), "AVALANCHE")!;
    expect(r.perDebt).toHaveLength(2);
    for (const d of r.perDebt) expect(d.months).toBeGreaterThan(0);
    expect(r.months).toBeGreaterThan(0);
  });

  it("returns null when the budget cannot service the minimums", () => {
    expect(simulateStrategy([card, auto], usd("50.00"), "AVALANCHE")).toBeNull();
  });

  it("honours a custom order", () => {
    const r = simulateStrategy([card, auto], usd("900.00"), "CUSTOM", ["auto", "amex"])!;
    expect(r.order).toEqual(["auto", "amex"]);
  });

  it("computes a weighted APR and total minimum", () => {
    // Mostly the low-rate auto loan, so the blend sits near it.
    expect(weightedApr([card, auto])).toBeGreaterThan(490);
    expect(weightedApr([card, auto])).toBeLessThan(900);
    expect(weightedApr([])).toBe(0);
    expect(toDecimalString(totalMinimum([card, auto], "USD"))).toBe("470.22");
  });
});
