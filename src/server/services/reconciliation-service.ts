import { and, desc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  accounts,
  reconciliations,
  transactions as txTable,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { ConflictError, NotFoundError } from "@/src/server/errors";
import * as audit from "./audit-service";
import * as accountRepo from "@/src/server/repositories/account-repository";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { startOfUtcDay } from "@/src/domain/schedule";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import * as z from "zod";
import type { closeReconciliationSchema, startReconciliationSchema } from "@/src/lib/schemas";

/**
 * Reconciliation.
 *
 * The user enters the balance their bank actually shows; we show what the
 * ledger says; the difference is the thing to explain. Closing with a residual
 * difference posts an ADJUSTMENT transaction rather than editing a balance,
 * because a balance you can edit directly is a balance nobody can trust.
 */

export interface ReconciliationDTO {
  id: string;
  accountId: string;
  accountName: string;
  currency: string;
  statementDate: string;
  recorded: MoneyDTO;
  actual: MoneyDTO;
  difference: MoneyDTO;
  adjustment: MoneyDTO;
  status: string;
  closedAt: string | null;
  note: string | null;
  clearedCount: number;
}

export interface ReconciliationWorkspace extends ReconciliationDTO {
  transactions: Array<{
    id: string;
    description: string | null;
    merchantName: string | null;
    occurredAt: string;
    amount: MoneyDTO;
    direction: number;
    status: string;
    cleared: boolean;
  }>;
  /** Live difference given the currently ticked rows. */
  uncleared: MoneyDTO;
}

/** Fold the cleared-transaction ids into the count the DTO mapper wants. */
function shape<T extends { transactions: Array<{ id: string }> }>(row: T) {
  const { transactions: cleared, ...rest } = row;
  return { ...rest, _count: { transactions: cleared.length } };
}

function toDto(row: {
  id: string; accountId: string; statementDate: Date; recordedMinor: bigint;
  actualMinor: bigint; differenceMinor: bigint; adjustmentMinor: bigint;
  status: string; closedAt: Date | null; note: string | null;
  account: { name: string; currency: string }; _count: { transactions: number };
}): ReconciliationDTO {
  const c = row.account.currency;
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.account.name,
    currency: c,
    statementDate: row.statementDate.toISOString(),
    recorded: toDTO(money(row.recordedMinor, c)),
    actual: toDTO(money(row.actualMinor, c)),
    difference: toDTO(money(row.differenceMinor, c)),
    adjustment: toDTO(money(row.adjustmentMinor, c)),
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
    note: row.note,
    clearedCount: row._count.transactions,
  };
}

export async function history(actor: ActorContext, accountId?: string): Promise<ReconciliationDTO[]> {
  const loaded = await rootDb.query.reconciliations.findMany({
    where: and(
      eq(reconciliations.userId, actor.userId),
      accountId ? eq(reconciliations.accountId, accountId) : undefined,
    ),
    orderBy: [desc(reconciliations.statementDate)],
    limit: 50,
    with: {
      account: { columns: { id: true, name: true, currency: true } },
      transactions: { columns: { id: true } },
    },
  });
  const rows = loaded.map(shape);
  return rows.map(toDto);
}

/**
 * Open a reconciliation. Only one can be in progress per account — two
 * overlapping sessions would tick the same transactions twice.
 */
export async function start(
  actor: ActorContext,
  input: z.infer<typeof startReconciliationSchema>,
): Promise<ReconciliationWorkspace> {
  return withTransaction(rootDb, async (tx) => {
    const account = await accountRepo.findById(actor.userId, input.accountId, tx);
    if (!account) throw new NotFoundError("That account");

    const open = await tx.query.reconciliations.findFirst({
      where: and(
        eq(reconciliations.userId, actor.userId),
        eq(reconciliations.accountId, account.id),
        eq(reconciliations.status, "IN_PROGRESS"),
      ),
      columns: { id: true },
    });
    if (open) {
      throw new ConflictError("There's already a reconciliation open for this account. Finish or abandon it first.");
    }

    const recordedMinor = await accountRepo.computeBalanceMinor(actor.userId, account.id, tx);
    const actualMinor = parseAmountForCurrency(input.actualBalance, account.currency, actor.locale);

    const [inserted] = await tx
      .insert(reconciliations)
      .values({
        userId: actor.userId,
        accountId: account.id,
        statementDate: startOfUtcDay(input.statementDate),
        recordedMinor,
        actualMinor,
        differenceMinor: actualMinor - recordedMinor,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That reconciliation");

    const row = shape(
      (await tx.query.reconciliations.findFirst({
        where: eq(reconciliations.id, inserted.id),
        with: {
      account: { columns: { id: true, name: true, currency: true } },
      transactions: { columns: { id: true } },
    },
      }))!,
    );

    await audit.record(
      actor,
      {
        action: "reconciliation.start",
        entityType: "Reconciliation",
        entityId: row.id,
        after: { accountId: account.id, recordedMinor, actualMinor },
      },
      tx,
    );

    return workspace(actor, row.id, tx);
  });
}

/** The tick-off list: everything unreconciled up to the statement date. */
export async function workspace(
  actor: ActorContext,
  id: string,
  db: Db = rootDb,
): Promise<ReconciliationWorkspace> {
  const loadedRow = await db.query.reconciliations.findFirst({
    where: and(eq(reconciliations.id, id), eq(reconciliations.userId, actor.userId)),
    with: {
      account: { columns: { id: true, name: true, currency: true } },
      transactions: { columns: { id: true } },
    },
  });
  const row = loadedRow ? shape(loadedRow) : undefined;
  if (!row) throw new NotFoundError("That reconciliation");

  const candidates = await db.query.transactions.findMany({
    where: and(
      eq(txTable.userId, actor.userId),
      eq(txTable.accountId, row.accountId),
      isNull(txTable.deletedAt),
      inArray(txTable.status, ["PENDING", "CLEARED", "RECONCILED"]),
      lte(txTable.occurredAt, new Date(row.statementDate.getTime() + 86_400_000)),
      or(isNull(txTable.reconciliationId), eq(txTable.reconciliationId, row.id)),
    ),
    orderBy: [desc(txTable.occurredAt)],
    limit: 500,
    columns: {
      id: true,
      description: true,
      occurredAt: true,
      amountMinor: true,
      direction: true,
      status: true,
      reconciliationId: true,
    },
    with: { merchant: { columns: { name: true } } },
  });

  const currency = row.account.currency;
  let unclearedMinor = 0n;
  const transactions = candidates.map((t) => {
    const cleared = t.reconciliationId === row.id || t.status === "RECONCILED";
    if (!cleared) unclearedMinor += BigInt(t.direction) * t.amountMinor;
    return {
      id: t.id,
      description: t.description,
      merchantName: t.merchant?.name ?? null,
      occurredAt: t.occurredAt.toISOString(),
      amount: toDTO(money(t.amountMinor, currency)),
      direction: t.direction,
      status: t.status,
      cleared,
    };
  });

  return { ...toDto(row), transactions, uncleared: toDTO(money(unclearedMinor, currency)) };
}

/**
 * Close it out.
 *
 * ADJUST posts a balancing transaction so the ledger agrees with the bank.
 * CLOSE_WITH_VARIANCE records that they disagree, on purpose, with a number.
 * Both are honest; silently overwriting the balance would not be.
 */
export async function close(
  actor: ActorContext,
  input: z.infer<typeof closeReconciliationSchema>,
): Promise<ReconciliationDTO> {
  return withTransaction(rootDb, async (tx) => {
    const loadedRow = await tx.query.reconciliations.findFirst({
      where: and(
        eq(reconciliations.id, input.reconciliationId),
        eq(reconciliations.userId, actor.userId),
        eq(reconciliations.status, "IN_PROGRESS"),
      ),
      with: {
      account: { columns: { id: true, name: true, currency: true } },
      transactions: { columns: { id: true } },
    },
    });
    const row = loadedRow ? shape(loadedRow) : undefined;
    if (!row) throw new NotFoundError("That reconciliation");

    if (input.resolution === "ABANDON") {
      await tx
        .update(reconciliations)
        .set({ status: "ABANDONED", closedAt: new Date(), note: input.note })
        .where(
          and(eq(reconciliations.id, row.id), eq(reconciliations.userId, actor.userId)),
        );
      const abandoned = shape(
        (await tx.query.reconciliations.findFirst({
          where: eq(reconciliations.id, row.id),
          with: {
      account: { columns: { id: true, name: true, currency: true } },
      transactions: { columns: { id: true } },
    },
        }))!,
      );
      await audit.record(
        actor,
        { action: "reconciliation.abandon", entityType: "Reconciliation", entityId: row.id, after: { status: "ABANDONED" } },
        tx,
      );
      return toDto(abandoned);
    }

    // Mark the ticked transactions as reconciled and attach them to this run.
    if (input.clearedTransactionIds.length > 0) {
      await tx
        .update(txTable)
        .set({ status: "RECONCILED", reconciliationId: row.id })
        .where(
          and(
            inArray(txTable.id, input.clearedTransactionIds),
            eq(txTable.userId, actor.userId),
            eq(txTable.accountId, row.accountId),
          ),
        );
    }

    const recordedMinor = await accountRepo.computeBalanceMinor(actor.userId, row.accountId, tx);
    const differenceMinor = row.actualMinor - recordedMinor;

    let adjustmentMinor = 0n;
    if (input.resolution === "ADJUST" && differenceMinor !== 0n) {
      adjustmentMinor = differenceMinor;
      const direction = differenceMinor > 0n ? 1 : -1;
      const magnitude = differenceMinor > 0n ? differenceMinor : -differenceMinor;

      await tx.insert(txTable).values({
          userId: actor.userId,
          accountId: row.accountId,
          type: "ADJUSTMENT",
          status: "RECONCILED",
          direction,
          amountMinor: magnitude,
          currency: row.account.currency,
          baseAmountMinor: magnitude,
          baseCurrency: actor.baseCurrency,
          occurredAt: row.statementDate,
          postedAt: row.statementDate,
          description: "Reconciliation adjustment",
          note: input.note ?? `Balancing entry from the ${row.statementDate.toISOString().slice(0, 10)} reconciliation`,
          reconciliationId: row.id,
          excludeFromBudget: true,
          excludeFromReports: false,
          createdById: actor.userId,
          createdVia: "SYSTEM",
      });
    }

    const finalBalance = await accountRepo.refreshCachedBalance(actor.userId, row.accountId, tx);
    await tx
      .update(accounts)
      .set({ lastReconciledAt: new Date() })
      .where(and(eq(accounts.id, row.accountId), eq(accounts.userId, actor.userId)));

    await tx
      .update(reconciliations)
      .set({
        recordedMinor: finalBalance,
        differenceMinor: row.actualMinor - finalBalance,
        adjustmentMinor,
        status: input.resolution === "ADJUST" ? "BALANCED" : "CLOSED_WITH_VARIANCE",
        closedAt: new Date(),
        note: input.note,
      })
      .where(and(eq(reconciliations.id, row.id), eq(reconciliations.userId, actor.userId)));

    const updated = shape(
      (await tx.query.reconciliations.findFirst({
        where: eq(reconciliations.id, row.id),
        with: {
      account: { columns: { id: true, name: true, currency: true } },
      transactions: { columns: { id: true } },
    },
      }))!,
    );

    await audit.record(
      actor,
      {
        action: "reconciliation.close",
        entityType: "Reconciliation",
        entityId: row.id,
        before: { status: "IN_PROGRESS", recordedMinor: row.recordedMinor },
        after: {
          status: updated.status,
          recordedMinor: finalBalance,
          adjustmentMinor,
          clearedCount: input.clearedTransactionIds.length,
        },
      },
      tx,
    );

    return toDto(updated);
  });
}

/** Accounts that have not been reconciled recently enough. */
export async function staleAccounts(actor: ActorContext, days = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await rootDb.query.accounts.findMany({
    where: and(
      eq(accounts.userId, actor.userId),
      isNull(accounts.deletedAt),
      isNull(accounts.archivedAt),
      inArray(accounts.type, ["CHECKING", "SAVINGS", "CASH", "CREDIT_CARD"]),
      or(isNull(accounts.lastReconciledAt), lt(accounts.lastReconciledAt, cutoff)),
    ),
    columns: {
      id: true,
      name: true,
      currency: true,
      cachedBalanceMinor: true,
      lastReconciledAt: true,
    },
  });

  return rows.map((r) => ({
    accountId: r.id,
    name: r.name,
    balance: toDTO(money(r.cachedBalanceMinor, r.currency)),
    lastReconciledAt: r.lastReconciledAt?.toISOString() ?? null,
    daysSince: r.lastReconciledAt
      ? Math.floor((Date.now() - r.lastReconciledAt.getTime()) / 86_400_000)
      : null,
  }));
}
