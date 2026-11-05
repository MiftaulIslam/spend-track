/**
 * Dates, timezones, and the two questions people keep conflating.
 *
 * The ledger buckets by **UTC day**: `occurredAt` is a timestamp, `dueOn` is a
 * `@db.Date`, and every aggregate uses `startOfUtcDay`. So a transaction dated
 * the 17th lives at `2026-09-17T00:00:00Z` and belongs to the 17th, full stop.
 *
 * That gives two separate questions, and the bug is always answering one with
 * the other:
 *
 *   1. "What calendar date is this ledger row?" — a property of the stored
 *      value. Format it in UTC, always. Formatting `2026-09-17T00:00:00Z` in
 *      New York prints "16 Sep", which is simply the wrong answer about a bill
 *      due on the 17th.
 *
 *   2. "What is today, for this person?" — a property of the person, not the
 *      server. `new Date().toISOString()` answers it in UTC and
 *      `toLocaleDateString()` answers it in whatever timezone the server
 *      happens to sit in. Both are wrong by up to a day, and the direction of
 *      the error depends on the hour, so it looks fine in testing and dates
 *      transactions to yesterday in production.
 *
 * Everything here is pure and takes `now` so it can be tested at a fixed
 * instant.
 */

/** A calendar date with no time and no zone, as `YYYY-MM-DD`. */
export type DateKey = string;

/**
 * Today's calendar date in `timezone`, as `YYYY-MM-DD`.
 *
 * Built from `Intl` parts rather than arithmetic on the epoch, because the
 * offset for a zone depends on the instant — DST, and the handful of zones that
 * have changed their standard offset outright.
 */
export function todayInTimezone(timezone: string, now: Date = new Date()): DateKey {
  return dateKeyInTimezone(now, timezone);
}

/** The calendar date `instant` falls on, in `timezone`. */
export function dateKeyInTimezone(instant: Date, timezone: string): DateKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The UTC calendar date of a stored ledger value. */
export function ledgerDateKey(value: Date | string): DateKey {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/**
 * Format a ledger date for display.
 *
 * Pinned to UTC on purpose — see (1) above. Use this for anything that came out
 * of the database, and never for "now".
 */
export function formatLedgerDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
  locale = "en-GB",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/**
 * Format an instant in the user's timezone.
 *
 * For things that genuinely happened at a moment — a session's last-seen time,
 * an audit entry — where the person wants it in their own wall-clock time.
 */
export function formatInstant(
  value: Date | string,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  locale = "en-GB",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(locale, { ...options, timeZone: safeZone(timezone) });
}

/**
 * The hour (0-23) it currently is for someone in `timezone`.
 *
 * For greetings and quiet hours. `Date.prototype.getHours()` returns the
 * server's hour, which is how a user in New York gets told "Late night" at
 * half past six in the evening.
 */
export function hourInTimezone(timezone: string, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(timezone),
    hour: "2-digit",
    hour12: false,
  }).format(now);
  // en-GB renders midnight as "24" in some ICU versions.
  return Number(hour) % 24;
}

/** Today's date, formatted in the user's timezone. */
export function formatToday(
  timezone: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
  locale = "en-GB",
  now: Date = new Date(),
): string {
  return now.toLocaleDateString(locale, { ...options, timeZone: safeZone(timezone) });
}

/** Shift a `YYYY-MM-DD` key by whole days, without going near local time. */
export function addDaysToKey(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * "Today", "Yesterday", "Tomorrow", or null when it is none of those.
 *
 * Compares two calendar dates as strings. Both must be in the same frame of
 * reference: pass a ledger key and a `todayInTimezone` key for the user's
 * timezone, so "Today" means today where the person is.
 */
export function relativeDayLabel(key: DateKey, todayKey: DateKey): string | null {
  if (key === todayKey) return "Today";
  if (key === addDaysToKey(todayKey, -1)) return "Yesterday";
  if (key === addDaysToKey(todayKey, 1)) return "Tomorrow";
  return null;
}

/** Whole days from `fromKey` to `toKey`; negative when `toKey` is earlier. */
export function daysBetweenKeys(fromKey: DateKey, toKey: DateKey): number {
  const ms = Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * An unknown or misspelled zone would otherwise throw from deep inside a
 * formatter, taking a page down over a settings value. UTC is the honest
 * fallback: it is what the ledger already uses.
 */
function safeZone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}
