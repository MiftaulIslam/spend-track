import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  applyWeekendPolicy,
  daysInMonth,
  describe as describeSchedule,
  elapsedFraction,
  firstOccurrenceOnOrAfter,
  isoWeekday,
  nextOccurrence,
  occurrences,
  ordinal,
  periodFor,
  utcDate,
} from "@/src/domain/schedule";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("date helpers", () => {
  it("knows month lengths including leap years", () => {
    expect(daysInMonth(2025, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 3)).toBe(30);
  });

  it("clamps month arithmetic instead of overflowing", () => {
    // JS setMonth would give 3 March here. That is the classic rent bug.
    expect(iso(addMonthsClamped(utcDate(2025, 0, 31), 1))).toBe("2025-02-28");
    expect(iso(addMonthsClamped(utcDate(2024, 0, 31), 1))).toBe("2024-02-29");
    expect(iso(addMonthsClamped(utcDate(2025, 0, 31), 1, 31))).toBe("2025-02-28");
    expect(iso(addMonthsClamped(utcDate(2025, 11, 15), 1))).toBe("2026-01-15");
    expect(iso(addMonthsClamped(utcDate(2025, 0, 15), -1))).toBe("2024-12-15");
  });

  it("uses ISO weekdays", () => {
    expect(isoWeekday(utcDate(2025, 8, 15))).toBe(1); // Monday
    expect(isoWeekday(utcDate(2025, 8, 21))).toBe(7); // Sunday
  });

  it("applies weekend policies", () => {
    const sat = utcDate(2025, 8, 20);
    const sun = utcDate(2025, 8, 21);
    expect(iso(applyWeekendPolicy(sat, "KEEP"))).toBe("2025-09-20");
    expect(iso(applyWeekendPolicy(sat, "PREVIOUS_WEEKDAY"))).toBe("2025-09-19");
    expect(iso(applyWeekendPolicy(sat, "NEXT_WEEKDAY"))).toBe("2025-09-22");
    expect(iso(applyWeekendPolicy(sun, "PREVIOUS_WEEKDAY"))).toBe("2025-09-19");
    expect(iso(applyWeekendPolicy(sun, "NEXT_WEEKDAY"))).toBe("2025-09-22");
    // A weekday is never moved.
    expect(iso(applyWeekendPolicy(utcDate(2025, 8, 17), "NEXT_WEEKDAY"))).toBe("2025-09-17");
  });
});

describe("occurrences", () => {
  it("expands a daily schedule", () => {
    const dates = occurrences(
      { frequency: "DAILY", startsOn: utcDate(2025, 8, 1) },
      { limit: 4 },
    );
    expect(dates.map(iso)).toEqual(["2025-09-01", "2025-09-02", "2025-09-03", "2025-09-04"]);
  });

  it("expands every N days", () => {
    const dates = occurrences(
      { frequency: "DAILY", interval: 10, startsOn: utcDate(2025, 8, 1) },
      { limit: 3 },
    );
    expect(dates.map(iso)).toEqual(["2025-09-01", "2025-09-11", "2025-09-21"]);
  });

  it("expands a weekly schedule anchored to a weekday", () => {
    const dates = occurrences(
      { frequency: "WEEKLY", byWeekday: 5, startsOn: utcDate(2025, 8, 1) }, // Friday
      { limit: 3 },
    );
    expect(dates.map(iso)).toEqual(["2025-09-05", "2025-09-12", "2025-09-19"]);
  });

  it("expands biweekly at a 14-day step", () => {
    const dates = occurrences(
      { frequency: "BIWEEKLY", byWeekday: 5, startsOn: utcDate(2025, 8, 1) },
      { limit: 3 },
    );
    expect(dates.map(iso)).toEqual(["2025-09-05", "2025-09-19", "2025-10-03"]);
  });

  it("holds the day of month across short months", () => {
    const dates = occurrences(
      { frequency: "MONTHLY", byMonthDay: 31, startsOn: utcDate(2025, 0, 1) },
      { limit: 4 },
    );
    // Clamps in February but returns to the 31st afterwards — it does not
    // "stick" at 28, which is the bug a naive implementation has.
    expect(dates.map(iso)).toEqual(["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30"]);
  });

  it("expands quarterly and yearly", () => {
    expect(
      occurrences({ frequency: "QUARTERLY", byMonthDay: 15, startsOn: utcDate(2025, 0, 1) }, { limit: 3 }).map(iso),
    ).toEqual(["2025-01-15", "2025-04-15", "2025-07-15"]);

    expect(
      occurrences({ frequency: "YEARLY", byMonth: 3, byMonthDay: 14, startsOn: utcDate(2025, 0, 1) }, { limit: 2 }).map(iso),
    ).toEqual(["2025-03-14", "2026-03-14"]);
  });

  it("applies the weekend policy without drifting the anchor", () => {
    // The 20th is a Saturday in Sep 2025; moving it must not shift October's.
    const dates = occurrences(
      {
        frequency: "MONTHLY",
        byMonthDay: 20,
        weekendPolicy: "PREVIOUS_WEEKDAY",
        startsOn: utcDate(2025, 8, 1),
      },
      { limit: 3 },
    );
    expect(dates.map(iso)).toEqual(["2025-09-19", "2025-10-20", "2025-11-20"]);
  });

  it("respects endsOn", () => {
    const dates = occurrences({
      frequency: "MONTHLY",
      byMonthDay: 1,
      startsOn: utcDate(2025, 0, 1),
      endsOn: utcDate(2025, 2, 15),
    });
    expect(dates.map(iso)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("respects maxOccurrences", () => {
    const dates = occurrences({
      frequency: "MONTHLY",
      byMonthDay: 1,
      startsOn: utcDate(2025, 0, 1),
      maxOccurrences: 2,
    });
    expect(dates).toHaveLength(2);
  });

  it("filters to a window", () => {
    const dates = occurrences(
      { frequency: "MONTHLY", byMonthDay: 1, startsOn: utcDate(2025, 0, 1) },
      { from: utcDate(2025, 5, 1), to: utcDate(2025, 7, 31) },
    );
    expect(dates.map(iso)).toEqual(["2025-06-01", "2025-07-01", "2025-08-01"]);
  });

  it("finds the next occurrence strictly after a date", () => {
    const spec = { frequency: "MONTHLY" as const, byMonthDay: 17, startsOn: utcDate(2025, 0, 17) };
    expect(iso(nextOccurrence(spec, utcDate(2025, 8, 17))!)).toBe("2025-10-17");
    expect(iso(firstOccurrenceOnOrAfter(spec, utcDate(2025, 8, 17))!)).toBe("2025-09-17");
  });

  it("terminates rather than looping on an exhausted schedule", () => {
    const dates = occurrences({
      frequency: "DAILY",
      startsOn: utcDate(2025, 0, 1),
      endsOn: utcDate(2024, 0, 1),
    });
    expect(dates).toEqual([]);
  });
});

describe("periods", () => {
  it("builds a calendar month window", () => {
    const w = periodFor("MONTHLY", utcDate(2025, 8, 17));
    expect(iso(w.start)).toBe("2025-09-01");
    expect(iso(w.end)).toBe("2025-10-01");
  });

  it("honours a pay-cycle month start", () => {
    // Paid on the 25th: 17 Sep belongs to the window that opened 25 Aug.
    const w = periodFor("MONTHLY", utcDate(2025, 8, 17), { monthStartsOn: 25 });
    expect(iso(w.start)).toBe("2025-08-25");
    expect(iso(w.end)).toBe("2025-09-25");

    const after = periodFor("MONTHLY", utcDate(2025, 8, 26), { monthStartsOn: 25 });
    expect(iso(after.start)).toBe("2025-09-25");
  });

  it("builds week, quarter and year windows", () => {
    const week = periodFor("WEEKLY", utcDate(2025, 8, 17)); // Wednesday
    expect(iso(week.start)).toBe("2025-09-15");
    expect(iso(week.end)).toBe("2025-09-22");

    const q = periodFor("QUARTERLY", utcDate(2025, 8, 17));
    expect(iso(q.start)).toBe("2025-07-01");
    expect(q.label).toBe("Q3 2025");

    const y = periodFor("ANNUAL", utcDate(2025, 8, 17));
    expect(iso(y.start)).toBe("2025-01-01");
    expect(iso(y.end)).toBe("2026-01-01");
  });

  it("computes the pace marker", () => {
    const w = periodFor("MONTHLY", utcDate(2025, 8, 17));
    expect(elapsedFraction(w, utcDate(2025, 8, 1))).toBeCloseTo(0, 5);
    expect(elapsedFraction(w, utcDate(2025, 8, 16))).toBeCloseTo(0.5, 2);
    expect(elapsedFraction(w, utcDate(2025, 9, 1))).toBe(1);
    // Clamped outside the window.
    expect(elapsedFraction(w, utcDate(2025, 10, 1))).toBe(1);
    expect(elapsedFraction(w, utcDate(2025, 7, 1))).toBe(0);
  });
});

describe("descriptions", () => {
  it("renders readable summaries", () => {
    expect(describeSchedule({ frequency: "DAILY", startsOn: utcDate(2025, 0, 1) })).toBe("Daily");
    expect(describeSchedule({ frequency: "MONTHLY", byMonthDay: 24, startsOn: utcDate(2025, 0, 1) }))
      .toBe("Monthly on the 24th");
    expect(describeSchedule({ frequency: "MONTHLY", byMonthDay: 31, startsOn: utcDate(2025, 0, 1) }))
      .toBe("Monthly on the last day");
    expect(describeSchedule({ frequency: "BIWEEKLY", byWeekday: 5, startsOn: utcDate(2025, 0, 1) }))
      .toBe("Every 2 weeks on Friday");
  });

  it("ordinalises correctly", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st",
    ]);
  });
});
