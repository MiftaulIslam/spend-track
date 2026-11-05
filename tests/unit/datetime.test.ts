import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  dateKeyInTimezone,
  daysBetweenKeys,
  formatInstant,
  formatLedgerDate,
  ledgerDateKey,
  relativeDayLabel,
  todayInTimezone,
} from "@/src/domain/datetime";

/**
 * The instant these tests are written around: 2026-09-16 22:45 UTC.
 *
 * Chosen because it is a different calendar date in three places at once —
 * the 17th in Dhaka, the 16th in UTC, the 16th in New York — which is exactly
 * the window where a timezone-naive "today" dates a transaction to yesterday.
 */
const LATE_EVENING_UTC = new Date("2026-09-16T22:45:00Z");

describe("todayInTimezone", () => {
  it("is already tomorrow east of UTC", () => {
    expect(todayInTimezone("Asia/Dhaka", LATE_EVENING_UTC)).toBe("2026-09-17");
  });

  it("is still today in UTC", () => {
    expect(todayInTimezone("UTC", LATE_EVENING_UTC)).toBe("2026-09-16");
  });

  it("is still today west of UTC", () => {
    expect(todayInTimezone("America/New_York", LATE_EVENING_UTC)).toBe("2026-09-16");
  });

  it("is still yesterday far enough west", () => {
    // 15:45 on the 16th in Honolulu — same day, but the early-morning case
    // below is the one that bites.
    expect(todayInTimezone("Pacific/Honolulu", LATE_EVENING_UTC)).toBe("2026-09-16");
    expect(todayInTimezone("Pacific/Honolulu", new Date("2026-09-17T05:00:00Z"))).toBe("2026-09-16");
  });

  it("respects daylight saving rather than a fixed offset", () => {
    // New York is UTC-4 in July and UTC-5 in January. A fixed offset would get
    // one of these wrong.
    expect(todayInTimezone("America/New_York", new Date("2026-07-01T03:30:00Z"))).toBe("2026-06-30");
    expect(todayInTimezone("America/New_York", new Date("2026-01-01T03:30:00Z"))).toBe("2025-12-31");
  });

  it("falls back to UTC for a zone it does not recognise", () => {
    // A bad settings value must not take a page down.
    expect(todayInTimezone("Mars/Olympus_Mons", LATE_EVENING_UTC)).toBe("2026-09-16");
    expect(todayInTimezone("", LATE_EVENING_UTC)).toBe("2026-09-16");
  });
});

describe("ledgerDateKey", () => {
  it("reads a UTC-midnight value as its own date", () => {
    expect(ledgerDateKey(new Date("2026-09-17T00:00:00Z"))).toBe("2026-09-17");
  });

  it("reads a mid-day timestamp as its UTC date", () => {
    expect(ledgerDateKey(new Date("2026-09-17T09:00:00Z"))).toBe("2026-09-17");
  });

  it("accepts an ISO string", () => {
    expect(ledgerDateKey("2026-09-17T00:00:00.000Z")).toBe("2026-09-17");
  });
});

describe("formatLedgerDate", () => {
  it("shows a UTC-midnight date as itself, not the day before", () => {
    // The bug this function exists to prevent: rendering a bill due on the
    // 17th as "16 Sep" for every user behind UTC.
    // "Sept", not "Sep": en-GB abbreviates September with four letters, and it
    // is the only month that does.
    expect(formatLedgerDate("2026-09-17T00:00:00Z")).toBe("17 Sept");
  });

  it("is stable regardless of where the process runs", () => {
    const value = "2026-01-01T00:00:00Z";
    expect(formatLedgerDate(value, { day: "numeric", month: "short", year: "numeric" })).toBe(
      "1 Jan 2026",
    );
  });
});

describe("formatInstant", () => {
  it("renders a moment in the user's own wall clock", () => {
    const dhaka = formatInstant(LATE_EVENING_UTC, "Asia/Dhaka", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(dhaka).toContain("17 Sep");
    expect(dhaka).toContain("04:45");
  });
});

describe("addDaysToKey", () => {
  it("crosses a month boundary", () => {
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("crosses a year boundary", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToKey("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("does not drift across a DST change", () => {
    // Local-time arithmetic would land on the 8th or the 10th here, depending
    // on the machine. Pure UTC key arithmetic cannot.
    expect(addDaysToKey("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysToKey("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("relativeDayLabel", () => {
  const today = "2026-09-17";

  it("labels the three days people recognise", () => {
    expect(relativeDayLabel("2026-09-17", today)).toBe("Today");
    expect(relativeDayLabel("2026-09-16", today)).toBe("Yesterday");
    expect(relativeDayLabel("2026-09-18", today)).toBe("Tomorrow");
  });

  it("returns null for anything else, so the caller shows a real date", () => {
    expect(relativeDayLabel("2026-09-15", today)).toBeNull();
    expect(relativeDayLabel("2026-09-19", today)).toBeNull();
  });

  it("says Today for the user's today, not the server's", () => {
    // Same ledger row, two users. In Dhaka it is today; in New York it is not
    // yet. Both answers are correct for their reader.
    const row = "2026-09-17";
    expect(relativeDayLabel(row, todayInTimezone("Asia/Dhaka", LATE_EVENING_UTC))).toBe("Today");
    expect(relativeDayLabel(row, todayInTimezone("America/New_York", LATE_EVENING_UTC))).toBe(
      "Tomorrow",
    );
  });
});

describe("daysBetweenKeys", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetweenKeys("2026-09-17", "2026-09-20")).toBe(3);
    expect(daysBetweenKeys("2026-09-20", "2026-09-17")).toBe(-3);
    expect(daysBetweenKeys("2026-09-17", "2026-09-17")).toBe(0);
  });

  it("is unaffected by a DST transition in between", () => {
    // 29 March 2026 is a European DST change; a local-time subtraction would
    // return 30.958… days and round to 31.
    expect(daysBetweenKeys("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("dateKeyInTimezone", () => {
  it("buckets an instant by the reader's calendar", () => {
    const instant = new Date("2026-09-17T02:30:00Z");
    expect(dateKeyInTimezone(instant, "Asia/Dhaka")).toBe("2026-09-17");
    expect(dateKeyInTimezone(instant, "America/New_York")).toBe("2026-09-16");
  });
});
