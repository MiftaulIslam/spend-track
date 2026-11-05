/**
 * Recurrence schedules.
 *
 * Every date here is a **calendar date in UTC at midnight**. Recurring money is
 * a calendar concept, not an instant: rent due on the 1st is due on the 1st
 * wherever you are, and a DST boundary must not move it. Using UTC midnight
 * consistently is what keeps "the 31st" from silently becoming "the 30th".
 *
 * No dependencies. Pure functions, exhaustively testable.
 */

export type Frequency =
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "CUSTOM_DAYS";

export type WeekendPolicy = "KEEP" | "PREVIOUS_WEEKDAY" | "NEXT_WEEKDAY";

export interface ScheduleSpec {
  frequency: Frequency;
  /** Repeat every N periods. 1 = every period. */
  interval?: number;
  /** ISO weekday 1 (Mon) – 7 (Sun) for WEEKLY / BIWEEKLY. */
  byWeekday?: number | null;
  /** 1–31 for MONTHLY / QUARTERLY / YEARLY. 31 means "last day of the month". */
  byMonthDay?: number | null;
  /** 1–12 for YEARLY. */
  byMonth?: number | null;
  weekendPolicy?: WeekendPolicy;
  startsOn: Date;
  endsOn?: Date | null;
  maxOccurrences?: number | null;
}

/* ------------------------------------------------------------ date helpers */

export const utcDate = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m, d, 0, 0, 0, 0));

export const startOfUtcDay = (d: Date): Date =>
  utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export const addDays = (d: Date, n: number): Date =>
  utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);

export const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/**
 * Add months while clamping the day to the target month's length.
 * 31 Jan + 1 month = 28 Feb (or 29 in a leap year), not 3 March. JavaScript's
 * own `setMonth` overflows into the next month, which is the classic source of
 * "my rent posted on the 3rd" bugs.
 */
export function addMonthsClamped(d: Date, months: number, preferredDay?: number): Date {
  const year = d.getUTCFullYear();
  const monthIndex = d.getUTCMonth() + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const wanted = preferredDay ?? d.getUTCDate();
  return utcDate(targetYear, targetMonth, Math.min(wanted, daysInMonth(targetYear, targetMonth)));
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export const isoWeekday = (d: Date): number => d.getUTCDay() === 0 ? 7 : d.getUTCDay();

export const isWeekend = (d: Date): boolean => isoWeekday(d) >= 6;

export function applyWeekendPolicy(d: Date, policy: WeekendPolicy): Date {
  if (policy === "KEEP" || !isWeekend(d)) return d;
  if (policy === "PREVIOUS_WEEKDAY") return addDays(d, isoWeekday(d) === 6 ? -1 : -2);
  return addDays(d, isoWeekday(d) === 6 ? 2 : 1);
}

export const sameUtcDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/* ------------------------------------------------------------- occurrences */

const MONTHS_PER_PERIOD: Partial<Record<Frequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/**
 * The nth occurrence (0-based) **before** the weekend policy is applied.
 * Kept separate so the policy never feeds back into the anchor date — otherwise
 * a schedule shifted to Friday once would keep shifting earlier every month.
 */
function rawOccurrence(spec: ScheduleSpec, n: number): Date {
  const interval = Math.max(1, spec.interval ?? 1);
  const start = startOfUtcDay(spec.startsOn);

  switch (spec.frequency) {
    case "DAILY":
      return addDays(start, n * interval);

    case "CUSTOM_DAYS":
      return addDays(start, n * interval);

    case "WEEKLY":
    case "BIWEEKLY": {
      const step = spec.frequency === "BIWEEKLY" ? 14 : 7 * interval;
      let first = start;
      if (spec.byWeekday) {
        const delta = (spec.byWeekday - isoWeekday(start) + 7) % 7;
        first = addDays(start, delta);
      }
      return addDays(first, n * step);
    }

    case "MONTHLY":
    case "QUARTERLY":
    case "YEARLY": {
      const months = (MONTHS_PER_PERIOD[spec.frequency] ?? 1) * interval;
      const preferredDay = spec.byMonthDay ?? start.getUTCDate();

      let anchor = start;
      if (spec.frequency === "YEARLY" && spec.byMonth) {
        anchor = utcDate(
          start.getUTCFullYear(),
          spec.byMonth - 1,
          Math.min(preferredDay, daysInMonth(start.getUTCFullYear(), spec.byMonth - 1)),
        );
        if (anchor < start) anchor = addMonthsClamped(anchor, 12, preferredDay);
      } else if (spec.byMonthDay) {
        anchor = utcDate(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          Math.min(preferredDay, daysInMonth(start.getUTCFullYear(), start.getUTCMonth())),
        );
        if (anchor < start) anchor = addMonthsClamped(anchor, months, preferredDay);
      }
      return addMonthsClamped(anchor, n * months, preferredDay);
    }
  }
}

export interface OccurrenceOptions {
  /** Inclusive lower bound. */
  from?: Date;
  /** Inclusive upper bound. */
  to?: Date;
  /** Safety valve so a misconfigured schedule cannot spin forever. */
  limit?: number;
}

/**
 * Expand a schedule into concrete due dates.
 * Returns dates **after** the weekend policy, sorted ascending, de-duplicated.
 */
export function occurrences(spec: ScheduleSpec, opts: OccurrenceOptions = {}): Date[] {
  const limit = opts.limit ?? 500;
  const from = opts.from ? startOfUtcDay(opts.from) : null;
  const to = opts.to ? startOfUtcDay(opts.to) : null;
  const endsOn = spec.endsOn ? startOfUtcDay(spec.endsOn) : null;
  const policy = spec.weekendPolicy ?? "KEEP";
  const maxN = spec.maxOccurrences ?? Number.MAX_SAFE_INTEGER;

  const out: Date[] = [];
  const seen = new Set<number>();

  // Hard iteration ceiling: even when `from` is far in the future, we stop
  // rather than loop. 20k covers ~55 years of daily schedules.
  for (let n = 0; n < 20_000 && out.length < limit && n < maxN; n++) {
    const raw = rawOccurrence(spec, n);
    if (endsOn && raw > endsOn) break;
    if (to && raw > to) break;

    const due = applyWeekendPolicy(raw, policy);
    if (from && due < from) continue;
    if (to && due > to) continue;

    const key = due.getTime();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(due);
    }
  }
  return out;
}

/** The next due date strictly after `after` (default: today). */
export function nextOccurrence(spec: ScheduleSpec, after: Date = new Date()): Date | null {
  const boundary = startOfUtcDay(after);
  const found = occurrences(spec, { from: addDays(boundary, 1), limit: 1 });
  return found[0] ?? null;
}

/** The due date on or after `on`. Used to seed a newly created schedule. */
export function firstOccurrenceOnOrAfter(spec: ScheduleSpec, on: Date): Date | null {
  return occurrences(spec, { from: on, limit: 1 })[0] ?? null;
}

/** Human summary for a schedule, e.g. "Monthly on the 24th". */
export function describe(spec: ScheduleSpec): string {
  const interval = Math.max(1, spec.interval ?? 1);
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];

  const every = interval === 1 ? "" : `every ${interval} `;
  switch (spec.frequency) {
    case "DAILY":
      return interval === 1 ? "Daily" : `Every ${interval} days`;
    case "CUSTOM_DAYS":
      return `Every ${interval} days`;
    case "WEEKLY":
      return `${interval === 1 ? "Weekly" : `Every ${interval} weeks`}${
        spec.byWeekday ? ` on ${WEEKDAYS[spec.byWeekday - 1]}` : ""
      }`;
    case "BIWEEKLY":
      return `Every 2 weeks${spec.byWeekday ? ` on ${WEEKDAYS[spec.byWeekday - 1]}` : ""}`;
    case "MONTHLY":
      return `${every ? `Every ${interval} months` : "Monthly"}${dayPhrase(spec.byMonthDay)}`;
    case "QUARTERLY":
      return `Quarterly${dayPhrase(spec.byMonthDay)}`;
    case "YEARLY":
      return `Annually${spec.byMonth ? ` in ${MONTHS[spec.byMonth - 1]}` : ""}${dayPhrase(spec.byMonthDay)}`;
  }
}

function dayPhrase(day?: number | null): string {
  if (!day) return "";
  if (day === 31) return " on the last day";
  return ` on the ${ordinal(day)}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/* --------------------------------------------------------- period windows */

export type PeriodKind = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL" | "CUSTOM";

export interface PeriodWindow {
  start: Date;
  /** Exclusive. `[start, end)` avoids every off-by-one at a period boundary. */
  end: Date;
  label: string;
}

/**
 * The period containing `on`, honouring a user's custom month start day
 * (so someone paid on the 25th can budget on their own pay cycle).
 */
export function periodFor(
  kind: PeriodKind,
  on: Date,
  opts: { weekStartsOn?: number; monthStartsOn?: number; customStart?: Date; customEnd?: Date } = {},
): PeriodWindow {
  const d = startOfUtcDay(on);
  const weekStartsOn = opts.weekStartsOn ?? 1;
  const monthStartsOn = Math.min(Math.max(opts.monthStartsOn ?? 1, 1), 28);

  switch (kind) {
    case "WEEKLY": {
      const delta = (isoWeekday(d) - weekStartsOn + 7) % 7;
      const start = addDays(d, -delta);
      return { start, end: addDays(start, 7), label: `Week of ${fmtDate(start)}` };
    }
    case "MONTHLY": {
      const start =
        d.getUTCDate() >= monthStartsOn
          ? utcDate(d.getUTCFullYear(), d.getUTCMonth(), monthStartsOn)
          : addMonthsClamped(utcDate(d.getUTCFullYear(), d.getUTCMonth(), monthStartsOn), -1, monthStartsOn);
      return { start, end: addMonthsClamped(start, 1, monthStartsOn), label: fmtMonth(start) };
    }
    case "QUARTERLY": {
      const q = Math.floor(d.getUTCMonth() / 3);
      const start = utcDate(d.getUTCFullYear(), q * 3, 1);
      return { start, end: addMonthsClamped(start, 3, 1), label: `Q${q + 1} ${start.getUTCFullYear()}` };
    }
    case "ANNUAL": {
      const start = utcDate(d.getUTCFullYear(), 0, 1);
      return { start, end: utcDate(d.getUTCFullYear() + 1, 0, 1), label: `${start.getUTCFullYear()}` };
    }
    case "CUSTOM": {
      const start = startOfUtcDay(opts.customStart ?? d);
      const end = addDays(startOfUtcDay(opts.customEnd ?? d), 1);
      return { start, end, label: `${fmtDate(start)} – ${fmtDate(addDays(end, -1))}` };
    }
  }
}

/** Fraction of a period that has elapsed — the budget pace marker. 0…1. */
export function elapsedFraction(window: PeriodWindow, now: Date = new Date()): number {
  const total = window.end.getTime() - window.start.getTime();
  if (total <= 0) return 1;
  const done = now.getTime() - window.start.getTime();
  return Math.min(1, Math.max(0, done / total));
}

export function previousPeriod(kind: PeriodKind, window: PeriodWindow, opts: Parameters<typeof periodFor>[2] = {}): PeriodWindow {
  return periodFor(kind, addDays(window.start, -1), opts);
}

const fmtDate = (d: Date): string =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const fmtMonth = (d: Date): string =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * How far back a run will reach to pick up occurrences it missed.
 *
 * Wide enough that a cron outage over a long weekend — or a fortnight — heals
 * itself on the next run. Narrow enough that it can never mistake a schedule's
 * history for work to do.
 */
export const CATCH_UP_DAYS = 14;

/**
 * Decide which dates a run is allowed to post for one schedule.
 *
 * Extracted and exported because this is the whole bug surface. `startsOn` is
 * the obvious starting point and the wrong one: a schedule's start date is
 * routinely historical, because you record your rent today having paid it for
 * three years. Starting there makes the first run invent three years of rent.
 *
 * The window therefore begins at whichever is latest of:
 *   - the day after the last run, so finished work is never redone;
 *   - the catch-up floor, so a long gap cannot flood the ledger;
 *   - the schedule's own start, so nothing predates it.
 *
 * and ends at today plus the schedule's lead days, which is the only part that
 * looks forward.
 */
export function materialisationWindow(schedule: {
  startsOn: Date;
  lastRunOn: Date | null;
  leadDays: number;
}, now: Date = new Date()): { from: Date; to: Date; catchUpFloor: Date; afterLastRun: Date | null } {
  const today = startOfUtcDay(now);
  const catchUpFloor = addDays(today, -CATCH_UP_DAYS);
  const afterLastRun = schedule.lastRunOn ? addDays(startOfUtcDay(schedule.lastRunOn), 1) : null;

  const from = [startOfUtcDay(schedule.startsOn), catchUpFloor, afterLastRun]
    .filter((d): d is Date => d !== null)
    .reduce((latest, d) => (d > latest ? d : latest));

  return { from, to: addDays(today, schedule.leadDays), catchUpFloor, afterLastRun };
}
