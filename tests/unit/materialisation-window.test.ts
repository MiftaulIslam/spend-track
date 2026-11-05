import { describe, expect, it } from "vitest";
import { CATCH_UP_DAYS, materialisationWindow, occurrences } from "@/src/domain/schedule";

/**
 * The window a recurring run is allowed to post into.
 *
 * This is the one calculation in the engine where the obvious answer is wrong,
 * and wrong in a way that costs the user money: starting from `startsOn` makes
 * the first run post the schedule's entire history as if it were due today.
 * These tests pin the shape of the window rather than the implementation.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("materialisationWindow", () => {
  const now = utc(2026, 9, 16);

  it("does not reach back to a historical startsOn", () => {
    // A schedule the user has been running for two years before recording it.
    const { from } = materialisationWindow(
      { startsOn: utc(2024, 1, 1), lastRunOn: null, leadDays: 2 },
      now,
    );
    expect(from).toEqual(utc(2026, 9, 2));
  });

  it("posts nothing historical for a monthly schedule recorded today", () => {
    const startsOn = utc(2024, 1, 1);
    const { from, to } = materialisationWindow({ startsOn, lastRunOn: null, leadDays: 2 }, now);

    const due = occurrences(
      { frequency: "MONTHLY", interval: 1, startsOn, byMonthDay: 30 },
      { from, to, limit: 24 },
    );

    // The 30th is outside 2 Sep – 18 Sep, so this run has nothing to do. Before
    // the fix it produced 20 back-dated paydays.
    expect(due).toEqual([]);
  });

  it("resumes the day after the last run", () => {
    const { from } = materialisationWindow(
      { startsOn: utc(2024, 1, 1), lastRunOn: utc(2026, 9, 10), leadDays: 2 },
      now,
    );
    expect(from).toEqual(utc(2026, 9, 11));
  });

  it("never starts before the schedule itself", () => {
    // A schedule starting next week: the floor must not pull the window back
    // in front of it.
    const { from } = materialisationWindow(
      { startsOn: utc(2026, 9, 20), lastRunOn: null, leadDays: 2 },
      now,
    );
    expect(from).toEqual(utc(2026, 9, 20));
  });

  it("clamps a long outage to the catch-up floor", () => {
    const { from, catchUpFloor } = materialisationWindow(
      { startsOn: utc(2024, 1, 1), lastRunOn: utc(2026, 1, 5), leadDays: 2 },
      now,
    );
    expect(from).toEqual(catchUpFloor);
    expect(catchUpFloor).toEqual(utc(2026, 9, 16 - CATCH_UP_DAYS));
  });

  it("prefers the last run over the floor when the gap is short", () => {
    // Two days down: catch up fully rather than clamping.
    const { from } = materialisationWindow(
      { startsOn: utc(2024, 1, 1), lastRunOn: utc(2026, 9, 14), leadDays: 2 },
      now,
    );
    expect(from).toEqual(utc(2026, 9, 15));
  });

  it("looks forward exactly leadDays", () => {
    expect(materialisationWindow({ startsOn: utc(2026, 1, 1), lastRunOn: null, leadDays: 0 }, now).to)
      .toEqual(utc(2026, 9, 16));
    expect(materialisationWindow({ startsOn: utc(2026, 1, 1), lastRunOn: null, leadDays: 5 }, now).to)
      .toEqual(utc(2026, 9, 21));
  });

  it("ignores the time of day on either bound", () => {
    const messy = new Date(Date.UTC(2026, 8, 16, 17, 43, 9, 122));
    const { from, to } = materialisationWindow(
      { startsOn: new Date(Date.UTC(2024, 0, 1, 11, 30)), lastRunOn: new Date(Date.UTC(2026, 8, 10, 23, 59)), leadDays: 2 },
      messy,
    );
    expect(from).toEqual(utc(2026, 9, 11));
    expect(to).toEqual(utc(2026, 9, 18));
  });

  it("a biweekly schedule catches its due date inside the window", () => {
    const startsOn = utc(2025, 1, 2); // a Thursday
    const { from, to } = materialisationWindow({ startsOn, lastRunOn: null, leadDays: 2 }, now);
    const due = occurrences(
      { frequency: "BIWEEKLY", interval: 1, startsOn, byWeekday: 4 },
      { from, to, limit: 24 },
    );
    // Fortnightly on Thursdays must land once in a 17-day window, and only once.
    expect(due).toHaveLength(1);
    expect(due[0]!.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(due[0]!.getTime()).toBeLessThanOrEqual(to.getTime());
  });
});
