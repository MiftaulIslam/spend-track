import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db as rootDb, withTransaction } from "@/src/server/db";
import { lendingPayments, lendingRecords } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as audit from "./audit-service";
import * as transactionService from "./transaction-service";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import * as z from "zod";
import type { createLendingSchema, recordLendingPaymentSchema } from "@/src/lib/schemas";

/**
 * Lending and borrowing.
 *
 * Money lent leaves your account but is still yours; money borrowed arrives but
 * is not income. The ledger types (`LENDING_OUT`, `BORROWING_IN`, …) keep both
 * out of spending and income totals while still moving the balance, which is
 * exactly the accounting a person does in their head.
 */

export interface LendingDTO {
  id: string;
  direction: "LENT" | "BORROWED";
  personName: string;
  personEmail: string | null;
  principal: MoneyDTO;
  outstanding: MoneyDTO;
  repaid: MoneyDTO;
  repaidFraction: number;
  currency: string;
  occurredAt: string;
  dueOn: string | null;
  daysOverdue: number | null;
  status: string;
  note: string | null;
  paymentCount: number;
  lastPaymentAt: string | null;
}

/**
 * Reshape a loaded row for `toDto`: the latest payment date and how many
 * there have been. Generic so the row keeps its own columns.
 */
function shape<T extends { lendingPayments: Array<{ occurredAt: Date }> }>(row: T) {
  const { lendingPayments: paid, ...rest } = row;
  return { ...rest, payments: paid.slice(0, 1), _count: { payments: paid.length } };
}

function toDto(row: {
  id: string; direction: string; personName: string; personEmail: string | null;
  principalMinor: bigint; outstandingMinor: bigint; currency: string;
  occurredAt: Date; dueOn: Date | null; status: string; note: string | null;
  payments: Array<{ occurredAt: Date }>; _count: { payments: number };
}): LendingDTO {
  const principal = money(row.principalMinor, row.currency);
  const outstanding = money(row.outstandingMinor, row.currency);
  const repaid = money(principal.minor - outstanding.minor, row.currency);

  const daysOverdue =
    row.dueOn && row.outstandingMinor > 0n
      ? Math.floor((Date.now() - row.dueOn.getTime()) / 86_400_000)
      : null;

  return {
    id: row.id,
    direction: row.direction as "LENT" | "BORROWED",
    personName: row.personName,
    personEmail: row.personEmail,
    principal: toDTO(principal),
    outstanding: toDTO(outstanding),
    repaid: toDTO(repaid),
    repaidFraction: principal.minor > 0n ? Number(repaid.minor) / Number(principal.minor) : 0,
    currency: row.currency,
    occurredAt: row.occurredAt.toISOString(),
    dueOn: row.dueOn?.toISOString() ?? null,
    daysOverdue: daysOverdue !== null && daysOverdue > 0 ? daysOverdue : null,
    status: row.status,
    note: row.note,
    paymentCount: row._count.payments,
    lastPaymentAt: row.payments[0]?.occurredAt.toISOString() ?? null,
  };
}

export async function list(
  actor: ActorContext,
  options: { direction?: "LENT" | "BORROWED"; includeSettled?: boolean } = {},
): Promise<LendingDTO[]> {
  const rows = await rootDb.query.lendingRecords.findMany({
    where: and(
      eq(lendingRecords.userId, actor.userId),
      isNull(lendingRecords.deletedAt),
      options.direction ? eq(lendingRecords.direction, options.direction) : undefined,
      options.includeSettled
        ? undefined
        : inArray(lendingRecords.status, ["OPEN", "PARTIALLY_SETTLED"]),
    ),
    orderBy: [asc(lendingRecords.status), desc(lendingRecords.occurredAt)],
    with: {
      lendingPayments: {
        orderBy: [desc(lendingPayments.occurredAt)],
        columns: { occurredAt: true },
      },
    },
  });
  return rows.map((r) => toDto(shape(r)));
}

export async function get(actor: ActorContext, id: string): Promise<LendingDTO> {
  const row = await rootDb.query.lendingRecords.findFirst({
    where: and(
      eq(lendingRecords.id, id),
      eq(lendingRecords.userId, actor.userId),
      isNull(lendingRecords.deletedAt),
    ),
    with: {
      lendingPayments: {
        orderBy: [desc(lendingPayments.occurredAt)],
        columns: { occurredAt: true },
      },
    },
  });
  if (!row) throw new NotFoundError("That record");
  return toDto(shape(row));
}

export async function create(
  actor: ActorContext,
  input: z.infer<typeof createLendingSchema>,
): Promise<{ record: LendingDTO; transactionId: string | null }> {
  return withTransaction(rootDb, async (tx) => {
    const principalMinor = parseAmountForCurrency(input.principal, input.currency, actor.locale);
    if (principalMinor <= 0n) throw new ValidationError("Enter an amount above zero.");

    const [inserted] = await tx
      .insert(lendingRecords)
      .values({
        userId: actor.userId,
        direction: input.direction,
        personName: input.personName,
        personEmail: input.personEmail || null,
        principalMinor,
        outstandingMinor: principalMinor,
        currency: input.currency,
        occurredAt: input.occurredAt,
        dueOn: input.dueOn,
        note: input.note,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That record");
    const record = { ...inserted, lendingPayments: [] as Array<{ occurredAt: Date }> };

    // When an account is given, the money actually moved, so the ledger records it.
    let transactionId: string | null = null;
    if (input.accountId) {
      const txn = await transactionService.create(
        actor,
        {
          accountId: input.accountId,
          type: input.direction === "LENT" ? "LENDING_OUT" : "BORROWING_IN",
          amount: input.principal,
          currency: input.currency,
          occurredAt: input.occurredAt,
          description:
            input.direction === "LENT" ? `Lent to ${input.personName}` : `Borrowed from ${input.personName}`,
          note: input.note,
          status: "CLEARED",
          tagIds: [],
          tagNames: [],
          attachmentIds: [],
          excludeFromBudget: true,
        },
        { createdVia: "MANUAL", db: tx },
      );
      transactionId = txn.id;
    }

    await audit.record(
      actor,
      {
        action: "lending.create",
        entityType: "LendingRecord",
        entityId: record.id,
        after: { direction: record.direction, personName: record.personName, principalMinor },
      },
      tx,
    );

    return { record: toDto(shape(record)), transactionId };
  });
}

export async function recordPayment(
  actor: ActorContext,
  input: z.infer<typeof recordLendingPaymentSchema>,
): Promise<{ record: LendingDTO; transactionId: string | null; settled: boolean }> {
  return withTransaction(rootDb, async (tx) => {
    const record = await tx.query.lendingRecords.findFirst({
      where: and(
        eq(lendingRecords.id, input.lendingId),
        eq(lendingRecords.userId, actor.userId),
        isNull(lendingRecords.deletedAt),
      ),
      with: {
      lendingPayments: {
        orderBy: [desc(lendingPayments.occurredAt)],
        columns: { occurredAt: true },
      },
    },
    });
    if (!record) throw new NotFoundError("That record");
    if (record.status === "SETTLED") throw new ValidationError("That's already settled.");
    if (record.status === "WRITTEN_OFF") throw new ValidationError("That was written off.");

    const amountMinor = parseAmountForCurrency(input.amount, record.currency, actor.locale);
    if (amountMinor <= 0n) throw new ValidationError("Enter an amount above zero.");
    // Overpayment is almost always a typo; catching it here beats a negative
    // outstanding balance nobody notices.
    if (amountMinor > record.outstandingMinor) {
      throw new ValidationError(
        `That's more than the ${toDTO(money(record.outstandingMinor, record.currency)).decimal} still outstanding.`,
      );
    }

    const [payment] = await tx
      .insert(lendingPayments)
      .values({
        lendingId: record.id,
        amountMinor,
        occurredAt: input.occurredAt,
        method: input.method,
        note: input.note,
      })
      .returning({ id: lendingPayments.id });
    if (!payment) throw new NotFoundError("That record");

    let transactionId: string | null = null;
    if (input.accountId) {
      const txn = await transactionService.create(
        actor,
        {
          accountId: input.accountId,
          type: record.direction === "LENT" ? "LENDING_REPAYMENT_IN" : "BORROWING_REPAYMENT_OUT",
          amount: input.amount,
          currency: record.currency,
          occurredAt: input.occurredAt,
          description:
            record.direction === "LENT"
              ? `Repayment from ${record.personName}`
              : `Repayment to ${record.personName}`,
          note: input.note,
          status: "CLEARED",
          tagIds: [],
          tagNames: [],
          attachmentIds: [],
          excludeFromBudget: true,
        },
        { createdVia: "MANUAL", db: tx },
      );
      transactionId = txn.id;
      await tx
        .update(lendingPayments)
        .set({ transactionId })
        .where(eq(lendingPayments.id, payment.id));
    }

    const outstanding = record.outstandingMinor - amountMinor;
    const settled = outstanding <= 0n;

    const [updatedRow] = await tx
      .update(lendingRecords)
      .set({
        outstandingMinor: outstanding,
        status: settled ? "SETTLED" : "PARTIALLY_SETTLED",
        settledAt: settled ? new Date() : null,
      })
      .where(and(eq(lendingRecords.id, record.id), eq(lendingRecords.userId, actor.userId)))
      .returning();
    if (!updatedRow) throw new NotFoundError("That record");
    const updated = { ...updatedRow, lendingPayments: record.lendingPayments };

    await audit.record(
      actor,
      {
        action: "lending.payment",
        entityType: "LendingRecord",
        entityId: record.id,
        before: { outstandingMinor: record.outstandingMinor },
        after: { outstandingMinor: outstanding, settled },
      },
      tx,
    );

    return { record: toDto(shape(updated)), transactionId, settled };
  });
}

/** Write off an uncollectable debt. Recorded, never silently deleted. */
export async function writeOff(actor: ActorContext, id: string, reason?: string): Promise<LendingDTO> {
  const record = await rootDb.query.lendingRecords.findFirst({
    where: and(
      eq(lendingRecords.id, id),
      eq(lendingRecords.userId, actor.userId),
      isNull(lendingRecords.deletedAt),
    ),
    with: {
      lendingPayments: {
        orderBy: [desc(lendingPayments.occurredAt)],
        columns: { occurredAt: true },
      },
    },
  });
  if (!record) throw new NotFoundError("That record");

  const [updatedRow] = await rootDb
    .update(lendingRecords)
    .set({
      status: "WRITTEN_OFF",
      writtenOffAt: new Date(),
      note: reason ? `${record.note ? `${record.note}\n` : ""}Written off: ${reason}` : record.note,
    })
    .where(and(eq(lendingRecords.id, id), eq(lendingRecords.userId, actor.userId)))
    .returning();
  if (!updatedRow) throw new NotFoundError("That record");
  const updated = { ...updatedRow, lendingPayments: record.lendingPayments };

  await audit.record(actor, {
    action: "lending.write_off",
    entityType: "LendingRecord",
    entityId: id,
    before: { status: record.status, outstandingMinor: record.outstandingMinor },
    after: { status: "WRITTEN_OFF", reason },
  });
  return toDto(shape(updated));
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.lendingRecords.findFirst({
    where: and(
      eq(lendingRecords.id, id),
      eq(lendingRecords.userId, actor.userId),
      isNull(lendingRecords.deletedAt),
    ),
  });
  if (!before) throw new NotFoundError("That record");
  await rootDb
    .update(lendingRecords)
    .set({ deletedAt: new Date() })
    .where(and(eq(lendingRecords.id, id), eq(lendingRecords.userId, actor.userId)));
  await audit.record(actor, { action: "lending.delete", entityType: "LendingRecord", entityId: id, before });
}

export async function payments(actor: ActorContext, lendingId: string) {
  const record = await rootDb.query.lendingRecords.findFirst({
    where: and(
      eq(lendingRecords.id, lendingId),
      eq(lendingRecords.userId, actor.userId),
      isNull(lendingRecords.deletedAt),
    ),
    columns: { currency: true },
  });
  if (!record) throw new NotFoundError("That record");

  const rows = await rootDb.query.lendingPayments.findMany({
    where: eq(lendingPayments.lendingId, lendingId),
    orderBy: [desc(lendingPayments.occurredAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    amount: toDTO(money(r.amountMinor, record.currency)),
    occurredAt: r.occurredAt.toISOString(),
    method: r.method,
    note: r.note,
    transactionId: r.transactionId,
  }));
}

export async function summary(actor: ActorContext) {
  const records = await list(actor, { includeSettled: true });
  const currency = actor.baseCurrency;

  const owedToYou = records
    .filter((r) => r.direction === "LENT" && (r.status === "OPEN" || r.status === "PARTIALLY_SETTLED"))
    .reduce((acc, r) => acc + BigInt(r.outstanding.minor), 0n);

  const youOwe = records
    .filter((r) => r.direction === "BORROWED" && (r.status === "OPEN" || r.status === "PARTIALLY_SETTLED"))
    .reduce((acc, r) => acc + BigInt(r.outstanding.minor), 0n);

  const writtenOff = records
    .filter((r) => r.status === "WRITTEN_OFF")
    .reduce((acc, r) => acc + BigInt(r.outstanding.minor), 0n);

  return {
    owedToYou: toDTO(money(owedToYou, currency)),
    youOwe: toDTO(money(youOwe, currency)),
    writtenOff: toDTO(money(writtenOff, currency)),
    openCount: records.filter((r) => r.status === "OPEN" || r.status === "PARTIALLY_SETTLED").length,
    overdueCount: records.filter((r) => r.daysOverdue !== null).length,
  };
}
