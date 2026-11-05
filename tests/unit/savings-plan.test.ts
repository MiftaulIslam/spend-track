import { describe, expect, it } from "vitest";
import {
  applyDeposit,
  contributionFor,
  contributionToSave,
  depositSchedule,
  describePlan,
  planFor,
} from "@/src/domain/savings-plan";
import { money } from "@/src/domain/money";

/**
 * Savings targets.
 *
 * The headline case throughout is the one that prompted the module: a ₹5,00,000
 * bike against a stated monthly contribution. INR has two minor units, so
 * ₹5,00,000 is 50_000_000 paise.
 */

const inr = (rupees: number) => money(BigInt(Math.round(rupees * 100)), "INR");
const usd = (dollars: number) => money(BigInt(Math.round(dollars * 100)), "USD");
const AT = new Date("2026-09-17T00:00:00Z");

describe("planFor", () => {
  it("answers the question the module exists for", () => {
    // ₹5,00,000 bike, nothing saved, ₹20,000 a month.
    const plan = planFor(
      { target: inr(500_000), saved: inr(0), contribution: inr(20_000) },
      AT,
    );
    expect(plan.periodsRemaining).toBe(25);
    expect(plan.monthsRemaining).toBe(25);
    expect(plan.completionDate).toEqual(new Date(Date.UTC(2028, 9, 17)));
  });

  it("counts a part-period as a whole deposit, and sizes that deposit correctly", () => {
    // ₹4,200 at ₹1,000 a month is five deposits: four of ₹1,000 and one of ₹200.
    const plan = planFor({ target: inr(4_200), saved: inr(0), contribution: inr(1_000) }, AT);
    expect(plan.periodsRemaining).toBe(5);
    expect(plan.finalDeposit).toEqual(inr(200));
  });

  it("makes the deposits add up to exactly the remainder", () => {
    // The invariant that stops "saved" from ever overshooting "target".
    for (const [target, contribution] of [
      [500_000, 20_000],
      [4_200, 1_000],
      [999.99, 33.33],
      [1, 0.07],
    ] as const) {
      const plan = planFor(
        { target: inr(target), saved: inr(0), contribution: inr(contribution) },
        AT,
      );
      const full = BigInt(plan.periodsRemaining - 1) * inr(contribution).minor;
      expect(full + plan.finalDeposit.minor, `${target} @ ${contribution}`).toBe(
        plan.remaining.minor,
      );
    }
  });

  it("counts what is already saved", () => {
    const plan = planFor(
      { target: inr(500_000), saved: inr(300_000), contribution: inr(20_000) },
      AT,
    );
    expect(plan.remaining).toEqual(inr(200_000));
    expect(plan.periodsRemaining).toBe(10);
    expect(plan.fraction).toBeCloseTo(0.6, 5);
  });

  it("reports a funded target as complete rather than as one more deposit", () => {
    const plan = planFor(
      { target: inr(500_000), saved: inr(500_000), contribution: inr(20_000) },
      AT,
    );
    expect(plan.verdict).toBe("COMPLETE");
    expect(plan.periodsRemaining).toBe(0);
    expect(plan.completionDate).toEqual(new Date(Date.UTC(2026, 8, 17)));
  });

  it("treats over-saving as complete, not as negative remaining", () => {
    const plan = planFor(
      { target: inr(500_000), saved: inr(520_000), contribution: inr(20_000) },
      AT,
    );
    expect(plan.remaining.minor).toBe(0n);
    expect(plan.fraction).toBe(1);
  });

  it("says so when nothing is going in, rather than inventing a date", () => {
    const plan = planFor({ target: inr(500_000), saved: inr(0), contribution: inr(0) }, AT);
    expect(plan.verdict).toBe("STALLED");
    expect(plan.completionDate).toBeNull();
    expect(plan.periodsRemaining).toBe(Infinity);
  });

  it("converts any frequency to a monthly figure for comparison", () => {
    // ₹5,000 weekly is 52 payments a year, so ₹21,666.67 a month — not ₹20,000.
    const plan = planFor(
      { target: inr(500_000), saved: inr(0), contribution: inr(5_000), frequency: "WEEKLY" },
      AT,
    );
    expect(plan.monthlyEquivalent).toEqual(inr(21_666.67));
  });
});

describe("planFor, judged against real surplus", () => {
  const base = { target: inr(500_000), saved: inr(0) };

  it("calls a plan beyond means when it exceeds the measured surplus", () => {
    const plan = planFor(
      { ...base, contribution: inr(20_000), monthlySurplus: inr(12_400) },
      AT,
    );
    expect(plan.verdict).toBe("BEYOND_MEANS");
    expect(plan.monthlyShortfall).toEqual(inr(7_600));
  });

  it("calls a plan tight when it eats most of the surplus", () => {
    // 18,000 of 20,000 is 90% — it fits, but nothing else does.
    const plan = planFor(
      { ...base, contribution: inr(18_000), monthlySurplus: inr(20_000) },
      AT,
    );
    expect(plan.verdict).toBe("TIGHT");
    expect(plan.monthlyShortfall.minor).toBe(0n);
  });

  it("calls a plan comfortable when it leaves room", () => {
    const plan = planFor(
      { ...base, contribution: inr(10_000), monthlySurplus: inr(20_000) },
      AT,
    );
    expect(plan.verdict).toBe("COMFORTABLE");
  });

  it("treats no surplus at all as beyond means", () => {
    // Spending everything they earn: any plan is aspirational.
    const plan = planFor({ ...base, contribution: inr(5_000), monthlySurplus: inr(0) }, AT);
    expect(plan.verdict).toBe("BEYOND_MEANS");
  });

  it("does not judge when there is no measurement", () => {
    const plan = planFor({ ...base, contribution: inr(20_000) }, AT);
    expect(plan.verdict).toBe("COMFORTABLE");
    expect(plan.monthlyShortfall.minor).toBe(0n);
  });
});

describe("contributionFor", () => {
  it("works back from a date", () => {
    // Twelve months to save ₹5,00,000 is ₹41,666.67 a month.
    const result = contributionFor(
      { target: inr(500_000), saved: inr(0), by: new Date("2027-09-17T00:00:00Z") },
      AT,
    );
    expect(result.periods).toBe(11);
    expect(result.perPeriod.minor).toBe(inr(45_454.55).minor);
  });

  it("rounds up, so the final deposit never leaves the target short", () => {
    // ₹100 over 3 periods is 33.34, not 33.33 — three of 33.33 is 99.99.
    const result = contributionFor(
      { target: inr(100), saved: inr(0), by: new Date("2026-12-16T00:00:00Z") },
      AT,
    );
    expect(result.perPeriod.minor * BigInt(result.periods)).toBeGreaterThanOrEqual(
      inr(100).minor,
    );
  });

  it("demands the whole remainder when the date has already passed", () => {
    const result = contributionFor(
      { target: inr(500_000), saved: inr(100_000), by: new Date("2026-01-01T00:00:00Z") },
      AT,
    );
    expect(result.feasible).toBe(false);
    expect(result.perPeriod).toEqual(inr(400_000));
  });

  it("asks for nothing when the target is already met", () => {
    const result = contributionFor(
      { target: inr(100), saved: inr(100), by: new Date("2027-01-01T00:00:00Z") },
      AT,
    );
    expect(result.periods).toBe(0);
    expect(result.perPeriod.minor).toBe(0n);
  });
});

describe("applyDeposit", () => {
  it("applies the whole deposit when it fits", () => {
    const result = applyDeposit({ remaining: inr(5_000) }, inr(2_000));
    expect(result.applied).toEqual(inr(2_000));
    expect(result.excess.minor).toBe(0n);
    expect(result.completes).toBe(false);
  });

  it("caps at the remainder and reports the excess", () => {
    // Paying ₹5,000 into a plan needing ₹800 must not make saved exceed target.
    const result = applyDeposit({ remaining: inr(800) }, inr(5_000));
    expect(result.applied).toEqual(inr(800));
    expect(result.excess).toEqual(inr(4_200));
    expect(result.completes).toBe(true);
  });

  it("completes exactly on the final deposit", () => {
    const result = applyDeposit({ remaining: inr(800) }, inr(800));
    expect(result.applied).toEqual(inr(800));
    expect(result.excess.minor).toBe(0n);
    expect(result.completes).toBe(true);
  });

  it("ignores a zero or negative deposit", () => {
    expect(applyDeposit({ remaining: inr(800) }, inr(0)).applied.minor).toBe(0n);
    expect(applyDeposit({ remaining: inr(800) }, inr(-50)).applied.minor).toBe(0n);
  });
});

describe("depositSchedule", () => {
  it("reconciles to the target on the final row", () => {
    const plan = planFor({ target: inr(4_200), saved: inr(0), contribution: inr(1_000) }, AT);
    const rows = depositSchedule(plan, "MONTHLY", AT);
    expect(rows).toHaveLength(5);
    expect(rows[rows.length - 1]!.runningTotal).toEqual(inr(4_200));
    expect(rows[rows.length - 1]!.amount).toEqual(inr(200));
  });

  it("starts the running total from what is already saved", () => {
    const plan = planFor({ target: inr(5_000), saved: inr(1_000), contribution: inr(2_000) }, AT);
    const rows = depositSchedule(plan, "MONTHLY", AT);
    expect(rows[0]!.runningTotal).toEqual(inr(3_000));
    expect(rows[rows.length - 1]!.runningTotal).toEqual(inr(5_000));
  });

  it("returns nothing for a stalled or complete plan", () => {
    const stalled = planFor({ target: inr(5_000), saved: inr(0), contribution: inr(0) }, AT);
    expect(depositSchedule(stalled, "MONTHLY", AT)).toEqual([]);
    const done = planFor({ target: inr(5_000), saved: inr(5_000), contribution: inr(100) }, AT);
    expect(depositSchedule(done, "MONTHLY", AT)).toEqual([]);
  });

  it("caps a very long plan rather than returning hundreds of rows", () => {
    const plan = planFor({ target: inr(500_000), saved: inr(0), contribution: inr(100) }, AT);
    expect(plan.periodsRemaining).toBe(5000);
    expect(depositSchedule(plan, "MONTHLY", AT, 24)).toHaveLength(24);
  });
});

describe("contributionToSave", () => {
  it("says what it takes to finish sooner", () => {
    const plan = planFor(
      { target: inr(500_000), saved: inr(0), contribution: inr(20_000) },
      AT,
    );
    // 25 months at ₹20,000; finishing 5 months sooner means 20 months.
    const needed = contributionToSave(plan, 5);
    expect(needed).toEqual(inr(25_000));
  });

  it("asks for the whole remainder when there is no time left to spread it", () => {
    const plan = planFor({ target: inr(5_000), saved: inr(0), contribution: inr(1_000) }, AT);
    expect(contributionToSave(plan, 99)).toEqual(inr(5_000));
  });

  it("returns null for a plan with no end", () => {
    const plan = planFor({ target: inr(5_000), saved: inr(0), contribution: inr(0) }, AT);
    expect(contributionToSave(plan, 1)).toBeNull();
  });
});

describe("describePlan", () => {
  const base = { target: usd(6_000), saved: usd(0) };

  it("writes a sentence for each verdict", () => {
    expect(describePlan(planFor({ ...base, saved: usd(6_000), contribution: usd(100) }, AT))).toBe(
      "Fully funded.",
    );
    expect(describePlan(planFor({ ...base, contribution: usd(0) }, AT))).toContain("never completes");
    expect(
      describePlan(planFor({ ...base, contribution: usd(500), monthlySurplus: usd(200) }, AT)),
    ).toContain("more than you usually have spare");
  });

  it("says years once months stop being readable", () => {
    // 6,000 at 100/month is 60 months.
    expect(describePlan(planFor({ ...base, contribution: usd(100) }, AT))).toContain("5 years");
  });

  it("uses months below a year", () => {
    expect(describePlan(planFor({ ...base, contribution: usd(1_000) }, AT))).toContain("6 months");
  });
});
