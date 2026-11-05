import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
} from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  accounts,
  bills,
  recurringOccurrences,
  recurringTransactions,
  subscriptions,
  transactions,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError, toAppError } from "@/src/server/errors";
import * as audit from "./audit-service";
import * as transactionService from "./transaction-service";
import * as transferService from "./transfer-service";
import { loadActor } from "@/src/server/auth/guards";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import {
  materialisationWindow,
  type ScheduleSpec,
  addDays,
  describe as describeSchedule,
  firstOccurrenceOnOrAfter,
  occurrences,
  startOfUtcDay,
} from "@/src/domain/schedule";
import { semanticsOf, type TransactionType } from "@/src/domain/ledger";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type { CreateRecurringInput } from "@/src/lib/schemas";

/**
 * Recurring transactions.
 *
 * Occurrences materialise a couple of days ahead as PENDING transactions, so a
 * user sees what is coming and can adjust before it posts. The unique index on
 * (recurringId, dueOn) is what makes the job idempotent — running it twice, or
 * running it after a crash, creates nothing extra.
 */

export interface RecurringDTO {
  id: string;
  name: string;
  type: TransactionType;
  typeLabel: string;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amountMode: string;
  amount: MoneyDTO | null;
  /** For VARIABLE schedules: the trailing mean used as the estimate. */
  estimatedAmount: MoneyDTO | null;
  currency: string;
  cadence: string;
  nextDueOn: string | null;
  lastRunOn: string | null;
  status: string;
  autoCreate: boolean;
  reminder: boolean;
  note: string | null;
  upcoming: string[];
  /** Set when this schedule is the mechanism behind a bill or subscription. */
  managedBy: { kind: "bill" | "subscription"; id: string; name: string } | null;
}

function specOf(row: {
  frequency: string; interval: number; byWeekday: number | null; byMonthDay: number | null;
  byMonth: number | null; weekendPolicy: string; startsOn: Date; endsOn: Date | null;
  maxOccurrences: number | null;
}): ScheduleSpec {
  return {
    frequency: row.frequency as ScheduleSpec["frequency"],
    interval: row.interval,
    byWeekday: row.byWeekday,
    byMonthDay: row.byMonthDay,
    byMonth: row.byMonth,
    weekendPolicy: row.weekendPolicy as ScheduleSpec["weekendPolicy"],
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    maxOccurrences: row.maxOccurrences,
  };
}

/**
 * Estimate a variable amount from the trailing N occurrences.
 * Uses the mean rather than the last value, because one unusually cold January
 * should not become the standing estimate for the electricity bill.
 */
async function estimateAmount(
  userId: string,
  recurringId: string,
  window: number,
  db: Db,
): Promise<bigint | null> {
  const past = await db
    .select({ amountMinor: transactions.amountMinor })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.recurringId, recurringId),
        isNull(transactions.deletedAt),
        ne(transactions.status, "VOID"),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(window);
  if (past.length === 0) return null;
  const total = past.reduce((acc, t) => acc + t.amountMinor, 0n);
  return total / BigInt(past.length);
}

/**
 * A schedule can back a bill or a subscription; both are one-to-many in the
 * schema even though only one row is ever expected, so the first is taken.
 */
function shape<T extends {
  bills: Array<{ id: string; name: string }>;
  subscriptions: Array<{ id: string; name: string }>;
}>(row: T) {
  const { bills: b, subscriptions: sub, ...rest } = row;
  return { ...rest, bill: b[0] ?? null, subscription: sub[0] ?? null };
}

async function toDto(
  row: Awaited<ReturnType<typeof loadRecurring>>,
  db: Db,
): Promise<RecurringDTO> {
  if (!row) throw new NotFoundError("That schedule");
  const spec = specOf(row);
  const upcoming = occurrences(spec, { from: new Date(), limit: 3 });
  const estimate =
    row.amountMode === "VARIABLE"
      ? await estimateAmount(row.userId, row.id, row.estimateWindow, db)
      : null;

  return {
    id: row.id,
    name: row.name,
    type: row.type as TransactionType,
    typeLabel: semanticsOf(row.type as TransactionType).label,
    accountId: row.accountId,
    accountName: row.account.name,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    amountMode: row.amountMode,
    amount: row.amountMinor !== null ? toDTO(money(row.amountMinor, row.currency)) : null,
    estimatedAmount: estimate !== null ? toDTO(money(estimate, row.currency)) : null,
    currency: row.currency,
    cadence: describeSchedule(spec),
    nextDueOn: row.nextDueOn?.toISOString() ?? null,
    lastRunOn: row.lastRunOn?.toISOString() ?? null,
    status: row.status,
    autoCreate: row.autoCreate,
    reminder: row.reminder,
    note: row.note,
    upcoming: upcoming.map((d) => d.toISOString()),
    managedBy: row.bill
      ? { kind: "bill" as const, id: row.bill.id, name: row.bill.name }
      : row.subscription
        ? { kind: "subscription" as const, id: row.subscription.id, name: row.subscription.name }
        : null,
  };
}

async function loadRecurring(userId: string, id: string, db: Db) {
  const row = await db.query.recurringTransactions.findFirst({
    where: and(
      eq(recurringTransactions.id, id),
      eq(recurringTransactions.userId, userId),
      isNull(recurringTransactions.deletedAt),
    ),
    with: {
      account: { columns: { id: true, name: true, currency: true } },
      category: { columns: { id: true, name: true } },
      bills: { columns: { id: true, name: true }, limit: 1 },
      subscriptions: { columns: { id: true, name: true }, limit: 1 },
    },
  });
  return row ? shape(row) : undefined;
}

export async function list(
  actor: ActorContext,
  options: { status?: "ACTIVE" | "PAUSED" | "ENDED" } = {},
  db: Db = rootDb,
): Promise<RecurringDTO[]> {
  const loaded = await db.query.recurringTransactions.findMany({
    where: and(
      eq(recurringTransactions.userId, actor.userId),
      isNull(recurringTransactions.deletedAt),
      options.status ? eq(recurringTransactions.status, options.status) : undefined,
    ),
    orderBy: [asc(recurringTransactions.status), asc(recurringTransactions.nextDueOn)],
    with: {
      account: { columns: { id: true, name: true, currency: true } },
      category: { columns: { id: true, name: true } },
      bills: { columns: { id: true, name: true }, limit: 1 },
      subscriptions: { columns: { id: true, name: true }, limit: 1 },
    },
  });
  const rows = loaded.map(shape);
  return Promise.all(rows.map((r) => toDto(r, db)));
}

export async function get(actor: ActorContext, id: string, db: Db = rootDb): Promise<RecurringDTO> {
  return toDto(await loadRecurring(actor.userId, id, db), db);
}

export async function create(actor: ActorContext, input: CreateRecurringInput): Promise<RecurringDTO> {
  return withTransaction(rootDb, async (tx) => {
    const account = await tx.query.accounts.findFirst({
      where: and(
        eq(accounts.id, input.accountId),
        eq(accounts.userId, actor.userId),
        isNull(accounts.deletedAt),
      ),
      columns: { id: true },
    });
    if (!account) throw new NotFoundError("That account");

    const spec: ScheduleSpec = {
      frequency: input.frequency,
      interval: input.interval,
      byWeekday: input.byWeekday,
      byMonthDay: input.byMonthDay,
      byMonth: input.byMonth,
      weekendPolicy: input.weekendPolicy,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      maxOccurrences: input.maxOccurrences,
    };
    const nextDue = firstOccurrenceOnOrAfter(spec, startOfUtcDay(new Date()));
    if (!nextDue && !input.endsOn) {
      throw new ValidationError("That schedule never produces a date. Check the start date and frequency.");
    }

    const [inserted] = await tx
      .insert(recurringTransactions)
      .values({
        userId: actor.userId,
        name: input.name,
        type: input.type,
        accountId: input.accountId,
        toAccountId: input.toAccountId,
        categoryId: input.categoryId,
        amountMode: input.amountMode,
        amountMinor: input.amount ? parseAmountForCurrency(input.amount, input.currency, actor.locale) : null,
        currency: input.currency,
        frequency: input.frequency,
        interval: input.interval,
        byWeekday: input.byWeekday,
        byMonthDay: input.byMonthDay,
        byMonth: input.byMonth,
        weekendPolicy: input.weekendPolicy,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        maxOccurrences: input.maxOccurrences,
        leadDays: input.leadDays,
        autoCreate: input.autoCreate,
        reminder: input.reminder,
        reminderDaysBefore: input.reminderDaysBefore,
        note: input.note,
        nextDueOn: nextDue,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That schedule");

    const reloaded = await tx.query.recurringTransactions.findFirst({
      where: eq(recurringTransactions.id, inserted.id),
      with: {
      account: { columns: { id: true, name: true, currency: true } },
      category: { columns: { id: true, name: true } },
      bills: { columns: { id: true, name: true }, limit: 1 },
      subscriptions: { columns: { id: true, name: true }, limit: 1 },
    },
    });
    const row = shape(reloaded!);

    await audit.record(
      actor,
      { action: "recurring.create", entityType: "RecurringTransaction", entityId: row.id, after: { name: row.name, frequency: row.frequency, nextDueOn: nextDue } },
      tx,
    );
    return toDto(row, tx);
  });
}

export async function update(actor: ActorContext, id: string, input: Partial<CreateRecurringInput> & { status?: "ACTIVE" | "PAUSED" | "ENDED" }): Promise<RecurringDTO> {
  return withTransaction(rootDb, async (tx) => {
    const before = await loadRecurring(actor.userId, id, tx);
    if (!before) throw new NotFoundError("That schedule");

    const merged = { ...specOf(before) };
    if (input.frequency) merged.frequency = input.frequency;
    if (input.interval !== undefined) merged.interval = input.interval;
    if (input.byWeekday !== undefined) merged.byWeekday = input.byWeekday;
    if (input.byMonthDay !== undefined) merged.byMonthDay = input.byMonthDay;
    if (input.byMonth !== undefined) merged.byMonth = input.byMonth;
    if (input.weekendPolicy !== undefined) merged.weekendPolicy = input.weekendPolicy;
    if (input.startsOn !== undefined) merged.startsOn = input.startsOn;
    if (input.endsOn !== undefined) merged.endsOn = input.endsOn;

    const nextDue = firstOccurrenceOnOrAfter(merged, startOfUtcDay(new Date()));

    await tx
      .update(recurringTransactions)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.amountMode !== undefined ? { amountMode: input.amountMode } : {}),
        ...(input.amount !== undefined
          ? { amountMinor: input.amount ? parseAmountForCurrency(input.amount, before.currency, actor.locale) : null }
          : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.interval !== undefined ? { interval: input.interval } : {}),
        ...(input.byWeekday !== undefined ? { byWeekday: input.byWeekday } : {}),
        ...(input.byMonthDay !== undefined ? { byMonthDay: input.byMonthDay } : {}),
        ...(input.byMonth !== undefined ? { byMonth: input.byMonth } : {}),
        ...(input.weekendPolicy !== undefined ? { weekendPolicy: input.weekendPolicy } : {}),
        ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
        ...(input.endsOn !== undefined ? { endsOn: input.endsOn } : {}),
        ...(input.leadDays !== undefined ? { leadDays: input.leadDays } : {}),
        ...(input.autoCreate !== undefined ? { autoCreate: input.autoCreate } : {}),
        ...(input.reminder !== undefined ? { reminder: input.reminder } : {}),
        ...(input.status !== undefined
          ? { status: input.status, pausedAt: input.status === "PAUSED" ? new Date() : null }
          : {}),
        nextDueOn: nextDue,
      })
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.userId, actor.userId),
        ),
      );

    const after = await loadRecurring(actor.userId, id, tx);
    await audit.record(
      actor,
      {
        action: "recurring.update",
        entityType: "RecurringTransaction",
        entityId: id,
        before: { name: before.name, frequency: before.frequency, amountMinor: before.amountMinor, status: before.status },
        after: { name: after!.name, frequency: after!.frequency, amountMinor: after!.amountMinor, status: after!.status },
      },
      tx,
    );
    return toDto(after, tx);
  });
}

export async function setStatus(actor: ActorContext, id: string, status: "ACTIVE" | "PAUSED" | "ENDED"): Promise<RecurringDTO> {
  return update(actor, id, { status });
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.recurringTransactions.findFirst({
    where: and(
      eq(recurringTransactions.id, id),
      eq(recurringTransactions.userId, actor.userId),
      isNull(recurringTransactions.deletedAt),
    ),
  });
  if (!before) throw new NotFoundError("That schedule");
  await rootDb
    .update(recurringTransactions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(recurringTransactions.id, id),
        eq(recurringTransactions.userId, actor.userId),
      ),
    );
  await audit.record(actor, { action: "recurring.delete", entityType: "RecurringTransaction", entityId: id, before });
}

/** Skip one occurrence without breaking the rest of the schedule. */
export async function skipOccurrence(actor: ActorContext, id: string, dueOn: Date, reason?: string): Promise<void> {
  const row = await loadRecurring(actor.userId, id, rootDb);
  if (!row) throw new NotFoundError("That schedule");

  await rootDb
    .insert(recurringOccurrences)
    .values({
      recurringId: id,
      dueOn: startOfUtcDay(dueOn),
      status: "SKIPPED",
      skippedReason: reason,
    })
    .onConflictDoUpdate({
      target: [recurringOccurrences.recurringId, recurringOccurrences.dueOn],
      set: { status: "SKIPPED", skippedReason: reason },
    });

  await audit.record(actor, {
    action: "recurring.skip",
    entityType: "RecurringTransaction",
    entityId: id,
    after: { dueOn: startOfUtcDay(dueOn), reason },
  });
}

export interface MaterialiseResult {
  created: number;
  skipped: number;
  failed: number;
  /**
   * Occurrences older than the catch-up window, which this run deliberately
   * did not post. Reported rather than dropped silently: a non-zero value means
   * the scheduler has been down long enough that someone should look.
   */
  outsideWindow: number;
  details: Array<{ recurringId: string; name: string; dueOn: string; transactionId?: string; error?: string }>;
}

/** A schedule whose occurrence keeps failing stops being retried after this. */
const MAX_OCCURRENCE_ATTEMPTS = 5;

/**
 * Create the transactions that are due within the lead window.
 *
 * Every occurrence is claimed by inserting its `RecurringOccurrence` row; the
 * unique index on `(recurringId, dueOn)` means a second worker's insert fails
 * and it moves on, so two job runs racing each other cannot double-post the
 * rent.
 *
 * The claim and the transaction it stands for are written in ONE database
 * transaction. They used to be two, and the difference is not academic: a
 * failure in between left a claim with no transaction, the next run saw the
 * claim and skipped it, and that month's rent silently never posted. Rolling
 * the claim back on failure is what makes a retry possible at all.
 *
 * A FAILED occurrence is therefore retried, up to MAX_OCCURRENCE_ATTEMPTS — the
 * cause is usually a bug that gets fixed, and the ledger should heal itself once
 * it is. CREATED and SKIPPED are terminal by design and never revisited.
 */
export async function materialiseDue(
  options: { now?: Date; userId?: string; db?: Db } = {},
): Promise<MaterialiseResult> {
  const db = options.db ?? rootDb;
  const now = options.now ?? new Date();
  const result: MaterialiseResult = { created: 0, skipped: 0, failed: 0, outsideWindow: 0, details: [] };

  const loadedSchedules = await db.query.recurringTransactions.findMany({
    where: and(
      isNull(recurringTransactions.deletedAt),
      eq(recurringTransactions.status, "ACTIVE"),
      eq(recurringTransactions.autoCreate, true),
      options.userId ? eq(recurringTransactions.userId, options.userId) : undefined,
    ),
    with: {
      account: { columns: { id: true, name: true, currency: true } },
      category: { columns: { id: true, name: true } },
      bills: { columns: { id: true, name: true }, limit: 1 },
      subscriptions: { columns: { id: true, name: true }, limit: 1 },
    },
  });
  const schedules = loadedSchedules.map(shape);

  for (const schedule of schedules) {
    const spec = specOf(schedule);
    const { from, to, catchUpFloor, afterLastRun } = materialisationWindow(schedule, now);
    const due = occurrences(spec, { from, to, limit: 24 });

    // Anything between where the engine stopped and the window it will act on
    // is a gap this run is choosing not to fill. Counted so the job summary
    // says so rather than the ledger quietly developing a hole.
    if (afterLastRun && afterLastRun < catchUpFloor) {
      result.outsideWindow += occurrences(spec, {
        from: afterLastRun,
        to: addDays(catchUpFloor, -1),
        limit: 500,
      }).length;
    }

    for (const dueOn of due) {
      // What we already know about this slot decides whether to touch it.
      const existing = await db.query.recurringOccurrences.findFirst({
        where: and(
          eq(recurringOccurrences.recurringId, schedule.id),
          eq(recurringOccurrences.dueOn, dueOn),
        ),
        columns: { id: true, status: true, attempts: true },
      });

      if (existing && (existing.status === "CREATED" || existing.status === "SKIPPED")) {
        result.skipped++;
        continue;
      }
      if (existing && existing.attempts >= MAX_OCCURRENCE_ATTEMPTS) {
        // Given up on. Left FAILED so it stays visible on the calendar and in
        // admin rather than disappearing quietly.
        result.skipped++;
        continue;
      }

      const attempt = (existing?.attempts ?? 0) + 1;

      try {
        let amountMinor = schedule.amountMinor;
        if (schedule.amountMode === "VARIABLE") {
          amountMinor = await estimateAmount(schedule.userId, schedule.id, schedule.estimateWindow, db);
        }
        if (amountMinor === null || amountMinor <= 0n) {
          await db
            .insert(recurringOccurrences)
            .values({
              recurringId: schedule.id,
              dueOn,
              status: "SKIPPED",
              skippedReason: "No amount available yet",
              attempts: attempt,
            })
            .onConflictDoUpdate({
              target: [recurringOccurrences.recurringId, recurringOccurrences.dueOn],
              set: {
                status: "SKIPPED",
                skippedReason: "No amount available yet",
                attempts: attempt,
              },
            });
          result.skipped++;
          continue;
        }

        // Loaded BEFORE the transaction below, deliberately: loadActor always
        // uses the root client, and a serverless pool of one connection would
        // deadlock if this ran while the transaction held it.
        const actor = await loadActor(schedule.userId, "SYSTEM");
        if (!actor) {
          result.failed++;
          continue;
        }

        const amountString = toDTO(money(amountMinor, schedule.currency)).decimal;

        // Claim, post, and close out — atomically.
        const transactionId = await withTransaction(db, async (tx) => {
          const [occurrence] = await tx
            .insert(recurringOccurrences)
            .values({
              recurringId: schedule.id,
              dueOn,
              amountMinor,
              status: "SCHEDULED",
              attempts: attempt,
            })
            .onConflictDoUpdate({
              target: [recurringOccurrences.recurringId, recurringOccurrences.dueOn],
              set: {
                amountMinor,
                status: "SCHEDULED",
                attempts: attempt,
                skippedReason: null,
              },
            })
            .returning({ id: recurringOccurrences.id });
          if (!occurrence) throw new NotFoundError("That occurrence");

          let created: string;
          if (schedule.toAccountId) {
            const transfer = await transferService.create(
              actor,
              {
                fromAccountId: schedule.accountId,
                toAccountId: schedule.toAccountId,
                amount: amountString,
                occurredAt: dueOn,
                note: schedule.name,
              },
              { createdVia: "RECURRING", db: tx },
            );
            created = transfer.outTransactionId;
          } else {
            const txn = await transactionService.create(
              actor,
              {
                accountId: schedule.accountId,
                type: schedule.type as never,
                amount: amountString,
                currency: schedule.currency,
                occurredAt: dueOn,
                categoryId: schedule.categoryId,
                description: schedule.name,
                // Ahead of its date it is pending; the user can adjust or confirm.
                status: dueOn > startOfUtcDay(now) ? "PENDING" : "CLEARED",
                tagIds: [],
                tagNames: [],
                attachmentIds: [],
                excludeFromBudget: false,
              },
              { recurringId: schedule.id, createdVia: "RECURRING", skipRules: false, db: tx },
            );
            created = txn.id;
          }

          await tx
            .update(recurringOccurrences)
            .set({ status: "CREATED", transactionId: created })
            .where(eq(recurringOccurrences.id, occurrence.id));
          await tx
            .update(recurringTransactions)
            .set({
              lastRunOn: dueOn,
              nextDueOn: firstOccurrenceOnOrAfter(spec, addDays(dueOn, 1)),
            })
            .where(eq(recurringTransactions.id, schedule.id));

          return created;
        });

        result.created++;
        result.details.push({
          recurringId: schedule.id,
          name: schedule.name,
          dueOn: dueOn.toISOString(),
          transactionId,
        });
      } catch (error) {
        // The claim rolled back with everything else, so the failure is recorded
        // on the root client. `toAppError` both logs the raw error against an
        // incident id and yields a sentence that is safe to render — the
        // calendar shows this string.
        const appError = toAppError(error);
        result.failed++;
        result.details.push({
          recurringId: schedule.id,
          name: schedule.name,
          dueOn: dueOn.toISOString(),
          error: appError.userMessage,
        });
        await rootDb
          .insert(recurringOccurrences)
          .values({
            recurringId: schedule.id,
            dueOn,
            status: "FAILED",
            skippedReason: appError.userMessage,
            attempts: attempt,
          })
          .onConflictDoUpdate({
            target: [recurringOccurrences.recurringId, recurringOccurrences.dueOn],
            set: {
              status: "FAILED",
              skippedReason: appError.userMessage,
              attempts: attempt,
            },
          })
          .catch(() => undefined);
      }
    }
  }

  return result;
}

/**
 * Schedules due in the next N days.
 *
 * Excludes any schedule that backs a bill or a subscription. Those are
 * presented as the bill or the subscription — the schedule is the mechanism
 * behind them, and listing both makes rent appear twice on the dashboard.
 */
export async function upcoming(actor: ActorContext, days = 14, db: Db = rootDb) {
  const now = startOfUtcDay(new Date());
  const horizon = addDays(now, days);

  // Schedules that are not already represented by a bill or a subscription —
  // otherwise the same obligation shows up twice in "next 14 days".
  const loadedUpcoming = await db.query.recurringTransactions.findMany({
    where: and(
      eq(recurringTransactions.userId, actor.userId),
      isNull(recurringTransactions.deletedAt),
      eq(recurringTransactions.status, "ACTIVE"),
      notInArray(
        recurringTransactions.id,
        db
          .select({ id: bills.recurringId })
          .from(bills)
          .where(isNotNull(bills.recurringId)),
      ),
      notInArray(
        recurringTransactions.id,
        db
          .select({ id: subscriptions.recurringId })
          .from(subscriptions)
          .where(isNotNull(subscriptions.recurringId)),
      ),
    ),
    with: {
      account: { columns: { id: true, name: true, currency: true } },
      category: { columns: { id: true, name: true } },
      bills: { columns: { id: true, name: true }, limit: 1 },
      subscriptions: { columns: { id: true, name: true }, limit: 1 },
    },
  });
  const schedules = loadedUpcoming.map(shape);

  const items: Array<{
    kind: "recurring";
    id: string;
    name: string;
    dueOn: string;
    amount: MoneyDTO | null;
    type: TransactionType;
    accountName: string;
  }> = [];

  for (const schedule of schedules) {
    const due = occurrences(specOf(schedule), { from: now, to: horizon, limit: 6 });
    const estimate =
      schedule.amountMode === "VARIABLE"
        ? await estimateAmount(actor.userId, schedule.id, schedule.estimateWindow, db)
        : schedule.amountMinor;

    for (const dueOn of due) {
      items.push({
        kind: "recurring",
        id: schedule.id,
        name: schedule.name,
        dueOn: dueOn.toISOString(),
        amount: estimate !== null ? toDTO(money(estimate, schedule.currency)) : null,
        type: schedule.type as TransactionType,
        accountName: schedule.account.name,
      });
    }
  }

  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/**
 * Detect schedules hiding in the transaction history.
 *
 * Deterministic, not AI: group by merchant, look for three or more charges with
 * a consistent gap and a similar amount. The model is used later only to name
 * and explain what this found.
 */
export async function detectPatterns(actor: ActorContext, db: Db = rootDb) {
  const since = addDays(new Date(), -270);
  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, actor.userId),
      isNull(transactions.deletedAt),
      isNotNull(transactions.merchantId),
      isNull(transactions.recurringId),
      gte(transactions.occurredAt, since),
      inArray(transactions.type, ["EXPENSE", "FEE"]),
    ),
    orderBy: [asc(transactions.occurredAt)],
    columns: {
      merchantId: true,
      amountMinor: true,
      currency: true,
      occurredAt: true,
      accountId: true,
      categoryId: true,
    },
    with: { merchant: { columns: { name: true } } },
  });

  const byMerchant = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byMerchant.get(row.merchantId!) ?? [];
    list.push(row);
    byMerchant.set(row.merchantId!, list);
  }

  const suggestions: Array<{
    merchantId: string; merchantName: string; occurrences: number;
    medianGapDays: number; frequency: string; amount: MoneyDTO;
    amountVariance: number; accountId: string; categoryId: string | null; lastSeen: string;
  }> = [];

  for (const [merchantId, group] of byMerchant) {
    if (group.length < 3) continue;

    const gaps: number[] = [];
    for (let i = 1; i < group.length; i++) {
      gaps.push(Math.round((group[i].occurredAt.getTime() - group[i - 1].occurredAt.getTime()) / 86_400_000));
    }
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    if (medianGap < 5 || medianGap > 400) continue;

    // Irregular gaps mean coincidence, not a schedule.
    const gapSpread = Math.max(...gaps) - Math.min(...gaps);
    if (gapSpread > Math.max(6, medianGap * 0.4)) continue;

    const amounts = group.map((g) => Number(g.amountMinor));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = mean === 0 ? 1 : Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length) / mean;
    if (variance > 0.25) continue;

    suggestions.push({
      merchantId,
      merchantName: group[0].merchant?.name ?? "Unknown",
      occurrences: group.length,
      medianGapDays: medianGap,
      frequency: frequencyForGap(medianGap),
      amount: toDTO(money(BigInt(Math.round(mean)), group[0].currency)),
      amountVariance: variance,
      accountId: group.at(-1)!.accountId,
      categoryId: group.at(-1)!.categoryId,
      lastSeen: group.at(-1)!.occurredAt.toISOString(),
    });
  }

  return suggestions.sort((a, b) => b.occurrences - a.occurrences);
}

function frequencyForGap(days: number): string {
  if (days <= 8) return "WEEKLY";
  if (days <= 16) return "BIWEEKLY";
  if (days <= 45) return "MONTHLY";
  if (days <= 120) return "QUARTERLY";
  return "YEARLY";
}
