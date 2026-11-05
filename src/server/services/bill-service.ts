import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  accounts,
  billOccurrences,
  bills,
  recurringTransactions,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as audit from "./audit-service";
import * as transactionService from "./transaction-service";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { addDays, occurrences, startOfUtcDay, type ScheduleSpec } from "@/src/domain/schedule";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import * as z from "zod";
import type { createBillSchema, payBillSchema } from "@/src/lib/schemas";

/**
 * Bills.
 *
 * A bill is a *due date with an expectation*, not a transaction. It becomes a
 * transaction only when it is paid. Estimated bills carry their estimate until
 * that happens, and the estimate is a trailing mean of what was actually paid —
 * never a guess and never a model output.
 */

export type BillState = "SCHEDULED" | "DUE" | "PAID" | "OVERDUE" | "SKIPPED";

export interface BillOccurrenceDTO {
  id: string;
  billId: string;
  billName: string;
  dueOn: string;
  expected: MoneyDTO;
  paid: MoneyDTO | null;
  state: BillState;
  daysUntil: number;
  isEstimate: boolean;
  accountId: string;
  accountName: string;
  categoryName: string | null;
  autoPay: boolean;
}

export interface BillDTO {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  amountMode: string;
  amount: MoneyDTO | null;
  estimatedAmount: MoneyDTO | null;
  currency: string;
  dueDay: number | null;
  autoPay: boolean;
  reminderDaysBefore: number;
  status: string;
  notes: string | null;
  nextOccurrence: BillOccurrenceDTO | null;
}

/** Rename the joined schedule to the `recurring` the DTO mappers expect. */
function shape<T extends { recurringTransaction: unknown }>(
  row: T,
): Omit<T, "recurringTransaction"> & { recurring: T["recurringTransaction"] } {
  const { recurringTransaction: rec, ...rest } = row;
  return { ...rest, recurring: rec };
}

/**
 * Only this bill's owner may read it. Used inside occurrence queries.
 *
 * Written as an uncorrelated `IN (SELECT …)` rather than a correlated EXISTS:
 * the relational query API aliases the outer table, and a subquery built here
 * would still name it unaliased, which Postgres rejects.
 */
const ownedBill = (userId: string) =>
  inArray(
    billOccurrences.billId,
    rootDb
      .select({ id: bills.id })
      .from(bills)
      .where(and(eq(bills.userId, userId), isNull(bills.deletedAt))),
  );

/** Trailing mean of what was actually paid, for a variable bill. */
async function estimate(billId: string, window: number, db: Db): Promise<bigint | null> {
  const past = await db
    .select({ paidMinor: billOccurrences.paidMinor })
    .from(billOccurrences)
    .where(
      and(
        eq(billOccurrences.billId, billId),
        eq(billOccurrences.status, "PAID"),
        isNotNull(billOccurrences.paidMinor),
      ),
    )
    .orderBy(desc(billOccurrences.dueOn))
    .limit(window);
  if (past.length === 0) return null;
  const total = past.reduce((acc, o) => acc + (o.paidMinor ?? 0n), 0n);
  return total / BigInt(past.length);
}

function stateOf(occurrence: { status: string; dueOn: Date }, now: Date): BillState {
  if (occurrence.status === "PAID") return "PAID";
  if (occurrence.status === "SKIPPED") return "SKIPPED";
  const today = startOfUtcDay(now);
  const due = startOfUtcDay(occurrence.dueOn);
  if (due < today) return "OVERDUE";
  if (due.getTime() - today.getTime() <= 3 * 86_400_000) return "DUE";
  return "SCHEDULED";
}

export async function list(actor: ActorContext, db: Db = rootDb): Promise<BillDTO[]> {
  const loaded = await db.query.bills.findMany({
    where: and(
      eq(bills.userId, actor.userId),
      isNull(bills.deletedAt),
      ne(bills.status, "ENDED"),
    ),
    orderBy: [asc(bills.name)],
    with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { id: true, name: true } },
      recurringTransaction: {
        columns: {
          frequency: true,
          interval: true,
          byMonthDay: true,
          byWeekday: true,
          byMonth: true,
          weekendPolicy: true,
          startsOn: true,
          endsOn: true,
          maxOccurrences: true,
        },
      },
      billOccurrences: {
        where: inArray(billOccurrences.status, ["SCHEDULED", "DUE", "OVERDUE"]),
        orderBy: [asc(billOccurrences.dueOn)],
        limit: 1,
      },
    },
  });
  const rows = loaded.map((r) => ({ ...shape(r), occurrences: r.billOccurrences }));

  const now = new Date();
  return Promise.all(
    rows.map(async (row) => {
      const est = row.amountMode === "VARIABLE" ? await estimate(row.id, 6, db) : null;
      const next = row.occurrences[0];
      return {
        id: row.id,
        name: row.name,
        accountId: row.accountId,
        accountName: row.account.name,
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? null,
        amountMode: row.amountMode,
        amount: row.amountMinor !== null ? toDTO(money(row.amountMinor, row.currency)) : null,
        estimatedAmount: est !== null ? toDTO(money(est, row.currency)) : null,
        currency: row.currency,
        dueDay: row.dueDay,
        autoPay: row.autoPay,
        reminderDaysBefore: row.reminderDaysBefore,
        status: row.status,
        notes: row.notes,
        nextOccurrence: next
          ? {
              id: next.id,
              billId: row.id,
              billName: row.name,
              dueOn: next.dueOn.toISOString(),
              expected: toDTO(money(next.expectedMinor, row.currency)),
              paid: next.paidMinor !== null ? toDTO(money(next.paidMinor, row.currency)) : null,
              state: stateOf(next, now),
              daysUntil: Math.ceil((startOfUtcDay(next.dueOn).getTime() - startOfUtcDay(now).getTime()) / 86_400_000),
              isEstimate: row.amountMode === "VARIABLE",
              accountId: row.accountId,
              accountName: row.account.name,
              categoryName: row.category?.name ?? null,
              autoPay: row.autoPay,
            }
          : null,
      };
    }),
  );
}

/** Every occurrence in a window, which is what the bills page and calendar show. */
export async function occurrencesInRange(
  actor: ActorContext,
  from: Date,
  to: Date,
  db: Db = rootDb,
): Promise<BillOccurrenceDTO[]> {
  const loadedOccurrences = await db.query.billOccurrences.findMany({
    where: and(
      ownedBill(actor.userId),
      gte(billOccurrences.dueOn, startOfUtcDay(from)),
      lte(billOccurrences.dueOn, startOfUtcDay(to)),
    ),
    orderBy: [asc(billOccurrences.dueOn)],
    with: {
      bill: {
        with: {
          account: { columns: { id: true, name: true } },
          category: { columns: { id: true, name: true } },
        },
      },
    },
  });
  const rows = loadedOccurrences;

  const now = new Date();
  return rows.map((o) => ({
    id: o.id,
    billId: o.billId,
    billName: o.bill.name,
    dueOn: o.dueOn.toISOString(),
    expected: toDTO(money(o.expectedMinor, o.bill.currency)),
    paid: o.paidMinor !== null ? toDTO(money(o.paidMinor, o.bill.currency)) : null,
    state: stateOf(o, now),
    daysUntil: Math.ceil((startOfUtcDay(o.dueOn).getTime() - startOfUtcDay(now).getTime()) / 86_400_000),
    isEstimate: o.bill.amountMode === "VARIABLE",
    accountId: o.bill.accountId,
    accountName: o.bill.account.name,
    categoryName: o.bill.category?.name ?? null,
    autoPay: o.bill.autoPay,
  }));
}

export async function create(actor: ActorContext, input: z.infer<typeof createBillSchema>): Promise<BillDTO> {
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
    if (input.amountMode === "FIXED" && !input.amount) {
      throw new ValidationError("A fixed bill needs an amount.");
    }

    // A bill drives a schedule; the schedule is what generates occurrences.
    const [recurring] = await tx
      .insert(recurringTransactions)
      .values({
        userId: actor.userId,
        name: input.name,
        type: "EXPENSE",
        accountId: input.accountId,
        categoryId: input.categoryId,
        amountMode: input.amountMode,
        amountMinor: input.amount ? parseAmountForCurrency(input.amount, input.currency, actor.locale) : null,
        currency: input.currency,
        frequency: input.frequency,
        byMonthDay: input.dueDay,
        startsOn: input.startsOn,
        // The bill service materialises occurrences; the recurring job must not
        // also create transactions for the same dates.
        autoCreate: false,
        reminder: true,
        reminderDaysBefore: input.reminderDaysBefore,
      })
      .returning({ id: recurringTransactions.id });
    if (!recurring) throw new NotFoundError("That bill");

    const [insertedBill] = await tx
      .insert(bills)
      .values({
        userId: actor.userId,
        name: input.name,
        accountId: input.accountId,
        categoryId: input.categoryId,
        recurringId: recurring.id,
        amountMode: input.amountMode,
        amountMinor: input.amount
          ? parseAmountForCurrency(input.amount, input.currency, actor.locale)
          : null,
        currency: input.currency,
        dueDay: input.dueDay,
        autoPay: input.autoPay,
        reminderDaysBefore: input.reminderDaysBefore,
        notes: input.notes,
      })
      .returning();
    if (!insertedBill) throw new NotFoundError("That bill");

    const reloaded = await tx.query.bills.findFirst({
      where: eq(bills.id, insertedBill.id),
      with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { id: true, name: true } },
      recurringTransaction: {
        columns: {
          frequency: true,
          interval: true,
          byMonthDay: true,
          byWeekday: true,
          byMonth: true,
          weekendPolicy: true,
          startsOn: true,
          endsOn: true,
          maxOccurrences: true,
        },
      },
    },
    });
    const bill = { ...shape(reloaded!), occurrences: [] as Array<typeof billOccurrences.$inferSelect> };

    await generateOccurrences(actor, bill.id, 6, tx);

    await audit.record(
      actor,
      { action: "bill.create", entityType: "Bill", entityId: bill.id, after: { name: bill.name, dueDay: bill.dueDay } },
      tx,
    );

    const [dto] = await list(actor, tx);
    return (await list(actor, tx)).find((b) => b.id === bill.id) ?? dto;
  });
}

/** Materialise the next N due dates as occurrences. Idempotent. */
export async function generateOccurrences(
  actor: ActorContext,
  billId: string,
  count: number,
  db: Db = rootDb,
): Promise<number> {
  const loadedBill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.userId, actor.userId), isNull(bills.deletedAt)),
    with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { id: true, name: true } },
      recurringTransaction: {
        columns: {
          frequency: true,
          interval: true,
          byMonthDay: true,
          byWeekday: true,
          byMonth: true,
          weekendPolicy: true,
          startsOn: true,
          endsOn: true,
          maxOccurrences: true,
        },
      },
    },
  });
  const bill = loadedBill ? shape(loadedBill) : undefined;
  if (!bill?.recurring) return 0;

  const spec: ScheduleSpec = {
    frequency: bill.recurring.frequency as ScheduleSpec["frequency"],
    interval: bill.recurring.interval,
    byWeekday: bill.recurring.byWeekday,
    byMonthDay: bill.recurring.byMonthDay,
    byMonth: bill.recurring.byMonth,
    weekendPolicy: bill.recurring.weekendPolicy as ScheduleSpec["weekendPolicy"],
    startsOn: bill.recurring.startsOn,
    endsOn: bill.recurring.endsOn,
    maxOccurrences: bill.recurring.maxOccurrences,
  };

  const from = addDays(startOfUtcDay(new Date()), -35);
  const due = occurrences(spec, { from, limit: count });
  const expected =
    bill.amountMode === "VARIABLE"
      ? (await estimate(bill.id, 6, db)) ?? bill.amountMinor ?? 0n
      : bill.amountMinor ?? 0n;

  let created = 0;
  for (const dueOn of due) {
    const inserted = await db
      .insert(billOccurrences)
      .values({ billId: bill.id, dueOn, expectedMinor: expected, status: "SCHEDULED" })
      .onConflictDoNothing()
      .returning({ id: billOccurrences.id });
    const result = { count: inserted.length };
    created += result.count;
  }
  return created;
}

/**
 * Mark a bill paid. This is where a bill becomes a real transaction — before
 * this, nothing has touched the ledger.
 */
export async function pay(
  actor: ActorContext,
  input: z.infer<typeof payBillSchema>,
): Promise<{ occurrence: BillOccurrenceDTO; transactionId: string }> {
  return withTransaction(rootDb, async (tx) => {
    const occurrence = await tx.query.billOccurrences.findFirst({
      where: and(eq(billOccurrences.id, input.occurrenceId), ownedBill(actor.userId)),
      with: {
        bill: {
          with: {
            account: { columns: { id: true, name: true } },
            category: { columns: { id: true, name: true } },
          },
        },
      },
    });
    if (!occurrence) throw new NotFoundError("That bill");
    if (occurrence.status === "PAID") throw new ValidationError("That bill is already marked paid.");

    const bill = occurrence.bill;
    const paidMinor = input.amount
      ? parseAmountForCurrency(input.amount, bill.currency, actor.locale)
      : occurrence.expectedMinor;

    const txn = await transactionService.create(
      actor,
      {
        accountId: input.accountId ?? bill.accountId,
        type: "EXPENSE",
        amount: (Number(paidMinor) / 100).toFixed(2),
        currency: bill.currency,
        occurredAt: input.paidAt,
        categoryId: bill.categoryId,
        description: bill.name,
        status: "CLEARED",
        tagIds: [],
        tagNames: [],
        attachmentIds: [],
        excludeFromBudget: false,
      },
      { billOccurrenceId: occurrence.id, createdVia: "MANUAL", db: tx },
    );

    await tx
      .update(billOccurrences)
      .set({ status: "PAID", paidMinor, paidAt: input.paidAt })
      .where(eq(billOccurrences.id, occurrence.id));

    await audit.record(
      actor,
      {
        action: "bill.pay",
        entityType: "BillOccurrence",
        entityId: occurrence.id,
        before: { status: occurrence.status },
        after: { status: "PAID", paidMinor, transactionId: txn.id },
      },
      tx,
    );

    // Keep the horizon topped up so the calendar always shows what's ahead.
    await generateOccurrences(actor, bill.id, 6, tx);

    const now = new Date();
    return {
      occurrence: {
        id: occurrence.id,
        billId: bill.id,
        billName: bill.name,
        dueOn: occurrence.dueOn.toISOString(),
        expected: toDTO(money(occurrence.expectedMinor, bill.currency)),
        paid: toDTO(money(paidMinor, bill.currency)),
        state: "PAID",
        daysUntil: Math.ceil((startOfUtcDay(occurrence.dueOn).getTime() - startOfUtcDay(now).getTime()) / 86_400_000),
        isEstimate: false,
        accountId: bill.accountId,
        accountName: bill.account.name,
        categoryName: bill.category?.name ?? null,
        autoPay: bill.autoPay,
      },
      transactionId: txn.id,
    };
  });
}

export async function skip(actor: ActorContext, occurrenceId: string): Promise<void> {
  const occurrence = await rootDb.query.billOccurrences.findFirst({
    where: and(eq(billOccurrences.id, occurrenceId), ownedBill(actor.userId)),
    columns: { id: true, status: true },
  });
  if (!occurrence) throw new NotFoundError("That bill");

  await rootDb
    .update(billOccurrences)
    .set({ status: "SKIPPED", dismissedAt: new Date() })
    .where(eq(billOccurrences.id, occurrenceId));
  await audit.record(actor, {
    action: "bill.skip",
    entityType: "BillOccurrence",
    entityId: occurrenceId,
    before: { status: occurrence.status },
    after: { status: "SKIPPED" },
  });
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.bills.findFirst({
    where: and(eq(bills.id, id), eq(bills.userId, actor.userId), isNull(bills.deletedAt)),
  });
  if (!before) throw new NotFoundError("That bill");

  await withTransaction(rootDb, async (tx) => {
    await tx
      .update(bills)
      .set({ deletedAt: new Date() })
      .where(and(eq(bills.id, id), eq(bills.userId, actor.userId)));
    if (before.recurringId) {
      await tx
        .update(recurringTransactions)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(recurringTransactions.id, before.recurringId),
            eq(recurringTransactions.userId, actor.userId),
          ),
        );
    }
    await audit.record(actor, { action: "bill.delete", entityType: "Bill", entityId: id, before }, tx);
  });
}

/** Occurrences that need a reminder or an overdue nudge. */
export async function dueForReminder(
  now = new Date(),
  db: Db = rootDb,
): Promise<Array<{ userId: string; occurrenceId: string; billName: string; dueOn: Date; expectedMinor: bigint; currency: string; overdue: boolean; dedupeKey: string }>> {
  const today = startOfUtcDay(now);
  const rows = await db.query.billOccurrences.findMany({
    where: and(
      inArray(billOccurrences.status, ["SCHEDULED", "DUE", "OVERDUE"]),
      lte(billOccurrences.dueOn, addDays(today, 7)),
      inArray(
        billOccurrences.billId,
        db
          .select({ id: bills.id })
          .from(bills)
          .where(and(isNull(bills.deletedAt), eq(bills.status, "ACTIVE"))),
      ),
    ),
    with: {
      bill: {
        columns: { userId: true, name: true, currency: true, reminderDaysBefore: true },
      },
    },
  });

  return rows
    .filter((o) => {
      const daysUntil = Math.ceil((startOfUtcDay(o.dueOn).getTime() - today.getTime()) / 86_400_000);
      return daysUntil <= o.bill.reminderDaysBefore;
    })
    .map((o) => {
      const overdue = startOfUtcDay(o.dueOn) < today;
      return {
        userId: o.bill.userId,
        occurrenceId: o.id,
        billName: o.bill.name,
        dueOn: o.dueOn,
        expectedMinor: o.expectedMinor,
        currency: o.bill.currency,
        overdue,
        // Overdue nudges repeat daily; the due reminder fires once.
        dedupeKey: overdue
          ? `bill-overdue:${o.id}:${today.toISOString().slice(0, 10)}`
          : `bill-due:${o.id}`,
      };
    });
}

/** Flip SCHEDULED rows to OVERDUE once their date passes. */
export async function markOverdue(now = new Date(), db: Db = rootDb): Promise<number> {
  const flipped = await db
    .update(billOccurrences)
    .set({ status: "OVERDUE" })
    .where(
      and(
        inArray(billOccurrences.status, ["SCHEDULED", "DUE"]),
        lt(billOccurrences.dueOn, startOfUtcDay(now)),
      ),
    )
    .returning({ id: billOccurrences.id });
  const result = { count: flipped.length };
  return result.count;
}
