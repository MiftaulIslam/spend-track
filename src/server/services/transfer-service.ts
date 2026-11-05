import { and, eq, isNull } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import { transactions, transfers } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as accountRepo from "@/src/server/repositories/account-repository";
import * as audit from "./audit-service";
import { createFxContext, rateOn, toBase } from "./fx-service";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { convert, rateToString } from "@/src/domain/fx";
import { type PairKind, classifyPair, directionOf } from "@/src/domain/ledger";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type { CreateTransferInput } from "@/src/lib/schemas";

/**
 * Transfers — the two-sided write.
 *
 * Both legs plus the joining `Transfer` row are created in one database
 * transaction. If anything fails, Postgres rolls back all three, so a
 * half-transfer — two accounts permanently disagreeing about where money went —
 * is not a state this system can reach.
 *
 * The *kind* of movement is inferred from the account types rather than asked
 * for: a user says "transfer" for both checking→savings and checking→Amex, but
 * only one of those is a credit-card payment, and analytics must know which.
 */

export interface TransferDTO {
  id: string;
  kind: PairKind;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  fromAmount: MoneyDTO;
  toAmount: MoneyDTO;
  fee: MoneyDTO | null;
  fxRate: string | null;
  occurredAt: string;
  note: string | null;
  outTransactionId: string;
  inTransactionId: string;
}

export interface CreateTransferOptions {
  kindHint?: PairKind;
  goalContributionId?: string;
  debtPaymentId?: string;
  lendingPaymentId?: string;
  createdVia?: "MANUAL" | "RECURRING" | "AI" | "IMPORT" | "SYSTEM";
  db?: Db;
}

export async function create(
  actor: ActorContext,
  input: CreateTransferInput,
  options: CreateTransferOptions = {},
): Promise<TransferDTO> {
  const run = async (tx: Db): Promise<TransferDTO> => {
    const [from, to] = await Promise.all([
      accountRepo.findById(actor.userId, input.fromAccountId, tx),
      accountRepo.findById(actor.userId, input.toAccountId, tx),
    ]);
    if (!from) throw new NotFoundError("The source account");
    if (!to) throw new NotFoundError("The destination account");
    if (from.id === to.id) throw new ValidationError("Pick two different accounts.");

    const fromAmountMinor = parseAmountForCurrency(input.amount, from.currency, actor.locale);
    if (fromAmountMinor <= 0n) {
      throw new ValidationError("Enter an amount greater than zero.", [
        { path: "amount", message: "Must be more than zero." },
      ]);
    }

    const feeMinor = input.fee
      ? parseAmountForCurrency(input.fee, from.currency, actor.locale)
      : 0n;

    // Cross-currency: the user may state the received amount (which is what the
    // bank actually credited); otherwise convert at the transaction-date rate.
    const fx = createFxContext(actor.baseCurrency);
    let toAmountMinor: bigint;
    let fxRateString: string | null = null;

    if (from.currency === to.currency) {
      toAmountMinor = fromAmountMinor;
    } else if (input.toAmount) {
      toAmountMinor = parseAmountForCurrency(input.toAmount, to.currency, actor.locale);
      if (toAmountMinor <= 0n) throw new ValidationError("The received amount must be more than zero.");
      // Derive the implied rate so the row explains itself later.
      const scale = 10n ** 12n;
      fxRateString = rateToString(
        (toAmountMinor * scale * 10n ** BigInt(exponentDelta(from.currency, to.currency))) /
          (fromAmountMinor === 0n ? 1n : fromAmountMinor),
      );
    } else {
      const rate = await rateOn(fx, from.currency, to.currency, input.occurredAt, tx);
      toAmountMinor = convert(money(fromAmountMinor, from.currency), to.currency, rate).minor;
      fxRateString = rateToString(rate);
    }

    const { kind, outType, inType } = classifyPair(
      { id: from.id, type: from.type as never },
      { id: to.id, type: to.type as never },
      options.kindHint,
    );

    const [transfer] = await tx
      .insert(transfers)
      .values({
        userId: actor.userId,
        kind,
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor,
        fromCurrency: from.currency,
        toAmountMinor,
        toCurrency: to.currency,
        fxRate: fxRateString,
        feeMinor,
        occurredAt: input.occurredAt,
        note: input.note,
      })
      .returning({ id: transfers.id });
    if (!transfer) throw new NotFoundError("That transfer");

    const { amount: outBase } = await toBase(
      fx,
      money(fromAmountMinor, from.currency),
      input.occurredAt,
      tx,
    );
    const { amount: inBase } = await toBase(
      fx,
      money(toAmountMinor, to.currency),
      input.occurredAt,
      tx,
    );

    const label = input.note ?? defaultLabel(kind, from.name, to.name);

    const [outTxn] = await tx
      .insert(transactions)
      .values({
        userId: actor.userId,
        accountId: from.id,
        type: outType,
        status: "CLEARED",
        direction: directionOf(outType),
        amountMinor: fromAmountMinor,
        currency: from.currency,
        baseAmountMinor: outBase.minor,
        baseCurrency: actor.baseCurrency,
        occurredAt: input.occurredAt,
        postedAt: input.occurredAt,
        description: label,
        note: input.note,
        transferId: transfer.id,
        goalContributionId: options.goalContributionId,
        debtPaymentId: options.debtPaymentId,
        lendingPaymentId: options.lendingPaymentId,
        createdById: actor.userId,
        createdVia: options.createdVia ?? "MANUAL",
      })
      .returning({ id: transactions.id });

    const [inTxn] = await tx
      .insert(transactions)
      .values({
        userId: actor.userId,
        accountId: to.id,
        type: inType,
        status: "CLEARED",
        direction: directionOf(inType),
        amountMinor: toAmountMinor,
        currency: to.currency,
        baseAmountMinor: inBase.minor,
        baseCurrency: actor.baseCurrency,
        occurredAt: input.occurredAt,
        postedAt: input.occurredAt,
        description: label,
        note: input.note,
        transferId: transfer.id,
        createdById: actor.userId,
        createdVia: options.createdVia ?? "MANUAL",
      })
      .returning({ id: transactions.id });

    // A transfer fee *is* an expense — it leaves the system — so it is written
    // as its own transaction rather than folded into the transfer amount.
    if (feeMinor > 0n) {
      const { amount: feeBase } = await toBase(fx, money(feeMinor, from.currency), input.occurredAt, tx);
      await tx.insert(transactions).values({
          userId: actor.userId,
          accountId: from.id,
          type: "FEE",
          status: "CLEARED",
          direction: -1,
          amountMinor: feeMinor,
          currency: from.currency,
          baseAmountMinor: feeBase.minor,
          baseCurrency: actor.baseCurrency,
          occurredAt: input.occurredAt,
          description: `Transfer fee · ${from.name} → ${to.name}`,
          createdById: actor.userId,
          createdVia: options.createdVia ?? "MANUAL",
      });
    }

    await accountRepo.refreshCachedBalance(actor.userId, from.id, tx);
    await accountRepo.refreshCachedBalance(actor.userId, to.id, tx);

    await audit.record(
      actor,
      {
        action: "transfer.create",
        entityType: "Transfer",
        entityId: transfer.id,
        after: {
          kind, fromAccountId: from.id, toAccountId: to.id,
          fromAmountMinor, toAmountMinor, feeMinor, occurredAt: input.occurredAt,
        },
      },
      tx,
    );

    return {
      id: transfer.id,
      kind,
      fromAccountId: from.id,
      fromAccountName: from.name,
      toAccountId: to.id,
      toAccountName: to.name,
      fromAmount: toDTO(money(fromAmountMinor, from.currency)),
      toAmount: toDTO(money(toAmountMinor, to.currency)),
      fee: feeMinor > 0n ? toDTO(money(feeMinor, from.currency)) : null,
      fxRate: fxRateString,
      occurredAt: input.occurredAt.toISOString(),
      note: input.note ?? null,
      outTransactionId: outTxn.id,
      inTransactionId: inTxn.id,
    };
  };

  return options.db ? run(options.db) : withTransaction(rootDb, run);
}

function exponentDelta(from: string, to: string): number {
  const exp = (c: string) => (["JPY", "KRW", "VND", "CLP", "ISK"].includes(c) ? 0 : ["KWD", "BHD", "JOD", "OMR", "TND"].includes(c) ? 3 : 2);
  return exp(from) - exp(to);
}

function defaultLabel(kind: PairKind, fromName: string, toName: string): string {
  switch (kind) {
    case "CREDIT_CARD_PAYMENT": return `Payment to ${toName}`;
    case "DEBT_PAYMENT": return `Payment to ${toName}`;
    case "GOAL_CONTRIBUTION": return `Contribution to ${toName}`;
    case "LENDING": return `Lent from ${fromName}`;
    default: return `${fromName} → ${toName}`;
  }
}

export async function get(actor: ActorContext, id: string): Promise<TransferDTO> {
  const row = await rootDb.query.transfers.findFirst({
    where: and(
      eq(transfers.id, id),
      eq(transfers.userId, actor.userId),
      isNull(transfers.deletedAt),
    ),
    with: {
      transactions: {
        columns: { id: true, direction: true },
        where: isNull(transactions.deletedAt),
      },
    },
  });
  if (!row) throw new NotFoundError("That transfer");

  const [from, to] = await Promise.all([
    accountRepo.findById(actor.userId, row.fromAccountId),
    accountRepo.findById(actor.userId, row.toAccountId),
  ]);

  return {
    id: row.id,
    kind: row.kind as PairKind,
    fromAccountId: row.fromAccountId,
    fromAccountName: from?.name ?? "Unknown",
    toAccountId: row.toAccountId,
    toAccountName: to?.name ?? "Unknown",
    fromAmount: toDTO(money(row.fromAmountMinor, row.fromCurrency)),
    toAmount: toDTO(money(row.toAmountMinor, row.toCurrency)),
    fee: row.feeMinor > 0n ? toDTO(money(row.feeMinor, row.fromCurrency)) : null,
    fxRate: row.fxRate?.toString() ?? null,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note,
    outTransactionId: row.transactions.find((t) => t.direction === -1)?.id ?? "",
    inTransactionId: row.transactions.find((t) => t.direction === 1)?.id ?? "",
  };
}

/** Deleting a transfer deletes both legs together. */
export async function remove(actor: ActorContext, id: string): Promise<void> {
  await withTransaction(rootDb, async (tx) => {
    const row = await tx.query.transfers.findFirst({
      where: and(
        eq(transfers.id, id),
        eq(transfers.userId, actor.userId),
        isNull(transfers.deletedAt),
      ),
      columns: {
        id: true,
        fromAccountId: true,
        toAccountId: true,
        fromAmountMinor: true,
        toAmountMinor: true,
        kind: true,
      },
    });
    if (!row) throw new NotFoundError("That transfer");

    const now = new Date();
    // Both legs and the transfer itself go together, inside one transaction —
    // a half-deleted transfer would leave one account permanently wrong.
    await tx
      .update(transactions)
      .set({ deletedAt: now })
      .where(
        and(
          eq(transactions.transferId, id),
          eq(transactions.userId, actor.userId),
          isNull(transactions.deletedAt),
        ),
      );
    await tx
      .update(transfers)
      .set({ deletedAt: now })
      .where(and(eq(transfers.id, id), eq(transfers.userId, actor.userId)));

    await accountRepo.refreshCachedBalance(actor.userId, row.fromAccountId, tx);
    await accountRepo.refreshCachedBalance(actor.userId, row.toAccountId, tx);

    await audit.record(
      actor,
      { action: "transfer.delete", entityType: "Transfer", entityId: id, before: row },
      tx,
    );
  });
}
