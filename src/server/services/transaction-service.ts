import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  attachments,
  merchants,
  tags,
  transactionSplits,
  transactionTags,
  transactions,
  transfers,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as repo from "@/src/server/repositories/transaction-repository";
import * as accountRepo from "@/src/server/repositories/account-repository";
import * as audit from "./audit-service";
import { createFxContext, toBase } from "./fx-service";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import {
  type TransactionType,
  directionOf,
  semanticsOf,
  validate as validateLedger,
} from "@/src/domain/ledger";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type {
  CreateTransactionInput,
  TransactionFilter,
  UpdateTransactionInput,
} from "@/src/lib/schemas";
import { resolveMerchant } from "./merchant-service";
import { resolveTags } from "./tag-service";
import { applyRulesToDraft } from "./rule-service";

/**
 * The ledger service.
 *
 * Two invariants live here and are never bypassed:
 *  1. An amount is stored positive; `direction` carries the sign, derived from
 *     the transaction type rather than from the caller.
 *  2. Any write that changes a balance refreshes the account's cached balance
 *     inside the *same* database transaction, so the cache cannot drift.
 */

export interface TransactionDTO {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  type: TransactionType;
  typeLabel: string;
  status: string;
  direction: number;
  amount: MoneyDTO;
  amountBase: MoneyDTO;
  /** Present only when the transaction currency differs from the account's. */
  fx: { rate: string; accountAmount: MoneyDTO } | null;
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: number | null;
  merchantId: string | null;
  merchantName: string | null;
  description: string | null;
  note: string | null;
  tags: Array<{ id: string; name: string; colorIndex: number }>;
  isSplit: boolean;
  splitCount: number;
  attachmentCount: number;
  needsReview: boolean;
  excludeFromBudget: boolean;
  isSpending: boolean;
  isIncome: boolean;
  isTransfer: boolean;
  transferId: string | null;
  recurringId: string | null;
  createdVia: string;
}

export function toTransactionDTO(row: repo.TransactionRow): TransactionDTO {
  const semantics = semanticsOf(row.type as TransactionType);
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.account.name,
    accountType: row.account.type,
    type: row.type as TransactionType,
    typeLabel: semantics.label,
    status: row.status,
    direction: row.direction,
    amount: toDTO(money(row.amountMinor, row.currency)),
    amountBase: toDTO(money(row.baseAmountMinor, row.baseCurrency)),
    fx:
      row.accountAmountMinor !== null && row.fxRate !== null
        ? {
            rate: row.fxRate.toString(),
            accountAmount: toDTO(money(row.accountAmountMinor, row.account.currency)),
          }
        : null,
    occurredAt: row.occurredAt.toISOString(),
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.colorIndex ?? null,
    merchantId: row.merchantId,
    merchantName: row.merchant?.name ?? null,
    description: row.description,
    note: row.note,
    tags: row.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, colorIndex: t.tag.colorIndex })),
    isSplit: row.isSplit,
    splitCount: row._count.splits,
    attachmentCount: row._count.attachments,
    needsReview: row.needsReview,
    excludeFromBudget: row.excludeFromBudget,
    isSpending: semantics.isSpending,
    isIncome: semantics.isIncome,
    isTransfer: semantics.isPaired,
    transferId: row.transferId,
    recurringId: row.recurringId,
    createdVia: row.createdVia,
  };
}

/* --------------------------------------------------------------- querying */

export async function list(actor: ActorContext, filter: TransactionFilter) {
  const page = await repo.listPage(actor.userId, filter);
  return {
    items: page.items.map(toTransactionDTO),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export async function get(actor: ActorContext, id: string) {
  const row = await repo.findById(actor.userId, id);
  if (!row) throw new NotFoundError("That transaction");
  return {
    ...toTransactionDTO(row as unknown as repo.TransactionRow),
    splits: row.splits.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      categoryName: s.category?.name ?? null,
      amount: toDTO(money(s.amountMinor, row.currency)),
      note: s.note,
      owedByLabel: s.owedByLabel,
      settledAt: s.settledAt?.toISOString() ?? null,
    })),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt.toISOString(),
    })),
    receipt: row.receipt
      ? {
          id: row.receipt.id,
          status: row.receipt.status,
          confidence: row.receipt.confidence,
          merchantName: row.receipt.merchantName,
          total: row.receipt.totalMinor ? toDTO(money(row.receipt.totalMinor, row.currency)) : null,
          tax: row.receipt.taxMinor ? toDTO(money(row.receipt.taxMinor, row.currency)) : null,
          tip: row.receipt.tipMinor ? toDTO(money(row.receipt.tipMinor, row.currency)) : null,
        }
      : null,
    transfer: row.transfer
      ? {
          id: row.transfer.id,
          kind: row.transfer.kind,
          fromAccountId: row.transfer.fromAccountId,
          toAccountId: row.transfer.toAccountId,
          fromAmount: toDTO(money(row.transfer.fromAmountMinor, row.transfer.fromCurrency)),
          toAmount: toDTO(money(row.transfer.toAmountMinor, row.transfer.toCurrency)),
        }
      : null,
  };
}

export async function totals(actor: ActorContext, from: Date, to: Date) {
  const t = await repo.totalsSql(actor.userId, from, to);
  return {
    spending: toDTO(money(t.spendingMinor, actor.baseCurrency)),
    income: toDTO(money(t.incomeMinor, actor.baseCurrency)),
    net: toDTO(money(t.incomeMinor - t.spendingMinor, actor.baseCurrency)),
    count: t.count,
  };
}

/* ---------------------------------------------------------------- writing */

export interface CreateOptions {
  /** Set by TransferService when writing one half of a pair. */
  transferId?: string;
  recurringId?: string;
  billOccurrenceId?: string;
  importRowId?: string;
  createdVia?: "MANUAL" | "IMPORT" | "RECURRING" | "RULE" | "AI" | "RECEIPT" | "API" | "SYSTEM";
  /** Automation rules are skipped for paired halves and for rule-created rows. */
  skipRules?: boolean;
  db?: Db;
}

export async function create(
  actor: ActorContext,
  input: CreateTransactionInput,
  options: CreateOptions = {},
): Promise<TransactionDTO> {
  const run = async (tx: Db): Promise<TransactionDTO> => {
    const account = await accountRepo.findById(actor.userId, input.accountId, tx);
    if (!account) throw new NotFoundError("That account");

    const currency = (input.currency ?? account.currency).toUpperCase();
    const amountMinor = parseAmountForCurrency(input.amount, currency, actor.locale);
    const type = input.type as TransactionType;
    const direction = directionOf(type);

    // Cross-currency: store both the transaction amount and what actually hit
    // the account, plus the rate used, so the row is self-explaining later.
    const fx = createFxContext(actor.baseCurrency);
    let accountAmountMinor: bigint | null = null;
    let fxRate: string | null = null;
    if (currency !== account.currency) {
      const { amount: converted, rate } = await toBase(
        { ...fx, baseCurrency: account.currency },
        money(amountMinor, currency),
        input.occurredAt,
        tx,
      );
      accountAmountMinor = converted.minor;
      fxRate = (Number(rate) / 1e12).toFixed(12);
    }

    const { amount: baseAmount } = await toBase(
      fx,
      money(amountMinor, currency),
      input.occurredAt,
      tx,
    );

    // Resolve the merchant before rules run, because rules match on merchant.
    const merchantId = await resolveMerchant(actor, {
      merchantId: input.merchantId ?? undefined,
      merchantName: input.merchantName,
      rawDescriptor: input.description,
      db: tx,
    });

    let draft = {
      categoryId: input.categoryId ?? null,
      merchantId,
      note: input.note ?? null,
      needsReview: false,
      excludeFromBudget: input.excludeFromBudget,
      tagNames: [...input.tagNames],
    };

    if (!options.skipRules && options.createdVia !== "RULE") {
      draft = await applyRulesToDraft(actor, {
        draft,
        amountMinor,
        accountId: account.id,
        description: input.description ?? null,
        occurredAt: input.occurredAt,
        db: tx,
      });
    }

    // If no rule and no explicit category, fall back to the merchant's default.
    if (!draft.categoryId && draft.merchantId) {
      const merchant = await tx.query.merchants.findFirst({
        where: and(eq(merchants.id, draft.merchantId), eq(merchants.userId, actor.userId)),
        columns: { defaultCategoryId: true },
      });
      draft.categoryId = merchant?.defaultCategoryId ?? null;
    }

    const splits = input.splits?.map((s) => ({
      categoryId: s.categoryId ?? null,
      amountMinor: parseAmountForCurrency(s.amount, currency, actor.locale),
      note: s.note,
      owedByLabel: s.owedByLabel,
    }));

    const violations = validateLedger({
      type,
      amountMinor,
      categoryId: draft.categoryId,
      transferId: options.transferId ?? null,
      reversesTransactionId: input.reversesTransactionId ?? null,
      splits,
    });
    if (violations.length > 0) {
      throw new ValidationError(violations[0].message, violations.map((v) => ({ path: v.code, message: v.message })));
    }

    // A refund with no explicit category inherits the category of what it reverses.
    let categoryId = draft.categoryId;
    if (semanticsOf(type).isReversal && input.reversesTransactionId && !categoryId) {
      const original = await tx.query.transactions.findFirst({
        where: and(
          eq(transactions.id, input.reversesTransactionId),
          eq(transactions.userId, actor.userId),
        ),
        columns: { categoryId: true },
      });
      categoryId = original?.categoryId ?? null;
    }

    const [created] = await tx
      .insert(transactions)
      .values({
        userId: actor.userId,
        accountId: account.id,
        type,
        status: input.status,
        direction,
        amountMinor,
        currency,
        accountAmountMinor,
        fxRate,
        baseAmountMinor: baseAmount.minor,
        baseCurrency: actor.baseCurrency,
        occurredAt: input.occurredAt,
        postedAt: input.status === "CLEARED" ? input.occurredAt : null,
        categoryId,
        merchantId: draft.merchantId,
        rawDescriptor: input.description ?? null,
        description: input.description ?? null,
        note: draft.note,
        locationLabel: input.locationLabel,
        externalRef: input.externalRef,
        isSplit: Boolean(splits?.length),
        excludeFromBudget: draft.excludeFromBudget,
        needsReview: draft.needsReview,
        reversesTransactionId: input.reversesTransactionId ?? null,
        transferId: options.transferId ?? null,
        recurringId: options.recurringId ?? null,
        billOccurrenceId: options.billOccurrenceId ?? null,
        importRowId: options.importRowId ?? null,
        createdById: actor.userId,
        createdVia: options.createdVia ?? "MANUAL",
      })
      .returning({ id: transactions.id });
    if (!created) throw new NotFoundError("That transaction");

    // Splits and attachments were nested writes under Prisma. Drizzle has no
    // nested writes, so they are separate statements — inside the same
    // transaction, so a transaction still never exists without its splits.
    if (splits?.length) {
      await tx.insert(transactionSplits).values(
        splits.map((s, i) => ({
          transactionId: created.id,
          categoryId: s.categoryId,
          amountMinor: s.amountMinor,
          // Base amount per split, prorated by the same rate as the parent.
          baseAmountMinor:
            (baseAmount.minor * s.amountMinor) / (amountMinor === 0n ? 1n : amountMinor),
          note: s.note,
          owedByLabel: s.owedByLabel,
          sortOrder: i,
        })),
      );
    }

    if (input.attachmentIds.length) {
      // Scoped by userId: an attachment id from a request must not be able to
      // attach someone else's file to this transaction.
      await tx
        .update(attachments)
        .set({ transactionId: created.id })
        .where(
          and(
            inArray(attachments.id, input.attachmentIds),
            eq(attachments.userId, actor.userId),
          ),
        );
    }

    const tagIds = await resolveTags(actor, {
      tagIds: input.tagIds,
      tagNames: draft.tagNames,
      db: tx,
    });
    if (tagIds.length > 0) {
      await tx
        .insert(transactionTags)
        .values(tagIds.map((tagId) => ({ transactionId: created.id, tagId })))
        .onConflictDoNothing();
    }

    // The balance cache is refreshed in the same transaction as the write.
    await accountRepo.refreshCachedBalance(actor.userId, account.id, tx);

    const row = await repo.findById(actor.userId, created.id, tx);
    if (!row) throw new NotFoundError("That transaction");

    await audit.record(
      actor,
      {
        action: "transaction.create",
        entityType: "Transaction",
        entityId: created.id,
        after: {
          type, amountMinor, currency, accountId: account.id,
          categoryId, merchantId: draft.merchantId, occurredAt: input.occurredAt,
        },
      },
      tx,
    );

    return toTransactionDTO(row as unknown as repo.TransactionRow);
  };

  return options.db ? run(options.db) : withTransaction(rootDb, run);
}

export async function update(
  actor: ActorContext,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionDTO> {
  return withTransaction(rootDb, async (tx) => {
    const before = await repo.findById(actor.userId, id, tx);
    if (!before) throw new NotFoundError("That transaction");

    const account = input.accountId
      ? await accountRepo.findById(actor.userId, input.accountId, tx)
      : await accountRepo.findById(actor.userId, before.accountId, tx);
    if (!account) throw new NotFoundError("That account");

    const currency = (input.currency ?? before.currency).toUpperCase();
    const type = (input.type ?? before.type) as TransactionType;
    const amountMinor =
      input.amount !== undefined
        ? parseAmountForCurrency(input.amount, currency, actor.locale)
        : before.amountMinor;
    const occurredAt = input.occurredAt ?? before.occurredAt;

    const violations = validateLedger({
      type,
      amountMinor,
      categoryId: input.categoryId ?? before.categoryId,
      transferId: before.transferId,
      reversesTransactionId: input.reversesTransactionId ?? before.reversesTransactionId,
    });
    if (violations.length > 0) {
      throw new ValidationError(violations[0].message, violations.map((v) => ({ path: v.code, message: v.message })));
    }

    const fx = createFxContext(actor.baseCurrency);
    const { amount: baseAmount } = await toBase(fx, money(amountMinor, currency), occurredAt, tx);

    const merchantId =
      input.merchantId !== undefined || input.merchantName !== undefined
        ? await resolveMerchant(actor, {
            merchantId: input.merchantId ?? undefined,
            merchantName: input.merchantName,
            db: tx,
          })
        : before.merchantId;

    await repo.update(
      actor.userId,
      id,
      {
        accountId: account.id,
        type,
        direction: directionOf(type),
        amountMinor,
        currency,
        baseAmountMinor: baseAmount.minor,
        occurredAt,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        merchantId,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.locationLabel !== undefined ? { locationLabel: input.locationLabel } : {}),
        ...(input.excludeFromBudget !== undefined ? { excludeFromBudget: input.excludeFromBudget } : {}),
        ...(input.needsReview !== undefined ? { needsReview: input.needsReview } : {}),
      },
      tx,
    );

    if (input.splits !== undefined) {
      await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
      if (input.splits.length > 0) {
        const splits = input.splits.map((s, i) => ({
          transactionId: id,
          categoryId: s.categoryId ?? null,
          amountMinor: parseAmountForCurrency(s.amount, currency, actor.locale),
          baseAmountMinor: 0n,
          note: s.note,
          owedByLabel: s.owedByLabel,
          sortOrder: i,
        }));
        const total = splits.reduce((acc, s) => acc + s.amountMinor, 0n);
        if (total !== amountMinor) {
          throw new ValidationError("Splits must add up to the transaction total exactly.");
        }
        for (const s of splits) {
          s.baseAmountMinor = (baseAmount.minor * s.amountMinor) / (amountMinor === 0n ? 1n : amountMinor);
        }
        await tx.insert(transactionSplits).values(splits);
      }
      await repo.update(actor.userId, id, { isSplit: input.splits.length > 0 }, tx);
    }

    if (input.tagIds !== undefined || input.tagNames !== undefined) {
      const tagIds = await resolveTags(actor, {
        tagIds: input.tagIds ?? [],
        tagNames: input.tagNames ?? [],
        db: tx,
      });
      await tx.delete(transactionTags).where(eq(transactionTags.transactionId, id));
      if (tagIds.length > 0) {
        await tx
          .insert(transactionTags)
          .values(tagIds.map((tagId) => ({ transactionId: id, tagId })))
          .onConflictDoNothing();
      }
    }

    // A moved transaction changes two balances.
    await accountRepo.refreshCachedBalance(actor.userId, account.id, tx);
    if (account.id !== before.accountId) {
      await accountRepo.refreshCachedBalance(actor.userId, before.accountId, tx);
    }

    const after = await repo.findById(actor.userId, id, tx);
    if (!after) throw new NotFoundError("That transaction");

    await audit.record(
      actor,
      {
        action: "transaction.update",
        entityType: "Transaction",
        entityId: id,
        before: {
          type: before.type, amountMinor: before.amountMinor, currency: before.currency,
          accountId: before.accountId, categoryId: before.categoryId,
          merchantId: before.merchantId, occurredAt: before.occurredAt,
          status: before.status, note: before.note,
        },
        after: {
          type: after.type, amountMinor: after.amountMinor, currency: after.currency,
          accountId: after.accountId, categoryId: after.categoryId,
          merchantId: after.merchantId, occurredAt: after.occurredAt,
          status: after.status, note: after.note,
        },
      },
      tx,
    );

    return toTransactionDTO(after as unknown as repo.TransactionRow);
  });
}

/**
 * Soft delete. Deleting one half of a transfer deletes both — a one-sided
 * transfer would leave two accounts permanently disagreeing.
 */
export async function remove(actor: ActorContext, ids: string[]): Promise<{ deleted: number }> {
  return withTransaction(rootDb, async (tx) => {
    const rows = await repo.findManyByIds(actor.userId, ids, tx);
    if (rows.length === 0) throw new NotFoundError("Those transactions");

    const transferIds = rows.map((r) => r.transferId).filter((x): x is string => Boolean(x));
    const paired = transferIds.length
      ? await tx
          .select({ id: transactions.id, accountId: transactions.accountId })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, actor.userId),
              inArray(transactions.transferId, transferIds),
              isNull(transactions.deletedAt),
            ),
          )
      : [];

    const allIds = [...new Set([...rows.map((r) => r.id), ...paired.map((p) => p.id)])];
    const accountIds = [...new Set([...rows.map((r) => r.accountId), ...paired.map((p) => p.accountId)])];

    const deleted = await repo.softDelete(actor.userId, allIds, tx);
    if (transferIds.length) {
      await tx
        .update(transfers)
        .set({ deletedAt: new Date() })
        .where(and(inArray(transfers.id, transferIds), eq(transfers.userId, actor.userId)));
    }

    for (const accountId of accountIds) {
      await accountRepo.refreshCachedBalance(actor.userId, accountId, tx);
    }

    for (const row of rows) {
      await audit.record(
        actor,
        {
          action: "transaction.delete",
          entityType: "Transaction",
          entityId: row.id,
          before: {
            type: row.type, amountMinor: row.amountMinor, currency: row.currency,
            accountId: row.accountId, categoryId: row.categoryId, occurredAt: row.occurredAt,
          },
        },
        tx,
      );
    }

    return { deleted };
  });
}

/** Undo, for the toast. Restores both halves of a transfer together. */
export async function restore(actor: ActorContext, ids: string[]): Promise<{ restored: number }> {
  return withTransaction(rootDb, async (tx) => {
    const rows = await tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        transferId: transactions.transferId,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.id, ids),
          eq(transactions.userId, actor.userId),
          isNotNull(transactions.deletedAt),
        ),
      );
    if (rows.length === 0) throw new NotFoundError("Those transactions");

    const transferIds = rows.map((r) => r.transferId).filter((x): x is string => Boolean(x));
    const paired = transferIds.length
      ? await tx
          .select({ id: transactions.id, accountId: transactions.accountId })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, actor.userId),
              inArray(transactions.transferId, transferIds),
              isNotNull(transactions.deletedAt),
            ),
          )
      : [];

    const allIds = [...new Set([...rows.map((r) => r.id), ...paired.map((p) => p.id)])];
    const restored = await repo.restore(actor.userId, allIds, tx);

    if (transferIds.length) {
      await tx
        .update(transfers)
        .set({ deletedAt: null })
        .where(and(inArray(transfers.id, transferIds), eq(transfers.userId, actor.userId)));
    }

    for (const accountId of new Set([...rows.map((r) => r.accountId), ...paired.map((p) => p.accountId)])) {
      await accountRepo.refreshCachedBalance(actor.userId, accountId, tx);
    }

    await audit.record(actor, {
      action: "transaction.restore",
      entityType: "Transaction",
      entityId: allIds[0],
      after: { restored: allIds.length },
    });

    return { restored };
  });
}

/** Bulk categorise / tag / flag from the transaction list. */
export async function bulkUpdate(
  actor: ActorContext,
  ids: string[],
  changes: { categoryId?: string | null; addTagIds?: string[]; needsReview?: boolean; excludeFromBudget?: boolean },
): Promise<{ updated: number }> {
  return withTransaction(rootDb, async (tx) => {
    const rows = await repo.findManyByIds(actor.userId, ids, tx);
    if (rows.length === 0) throw new NotFoundError("Those transactions");
    const ownedIds = rows.map((r) => r.id);

    if (changes.categoryId !== undefined || changes.needsReview !== undefined || changes.excludeFromBudget !== undefined) {
      await tx
        .update(transactions)
        .set({
          ...(changes.categoryId !== undefined ? { categoryId: changes.categoryId } : {}),
          ...(changes.needsReview !== undefined ? { needsReview: changes.needsReview } : {}),
          ...(changes.excludeFromBudget !== undefined
            ? { excludeFromBudget: changes.excludeFromBudget }
            : {}),
        })
        .where(
          and(inArray(transactions.id, ownedIds), eq(transactions.userId, actor.userId)),
        );
    }

    if (changes.addTagIds?.length) {
      const owned = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(inArray(tags.id, changes.addTagIds), eq(tags.userId, actor.userId)));
      const pairs = ownedIds.flatMap((transactionId) =>
        owned.map((t) => ({ transactionId, tagId: t.id })),
      );
      if (pairs.length) {
        await tx.insert(transactionTags).values(pairs).onConflictDoNothing();
      }
    }

    await audit.record(
      actor,
      {
        action: "transaction.bulk_update",
        entityType: "Transaction",
        entityId: ownedIds[0],
        after: { ids: ownedIds.length, ...changes },
      },
      tx,
    );

    return { updated: ownedIds.length };
  });
}

/** Warn before saving something that looks like it is already recorded. */
export async function findDuplicates(
  actor: ActorContext,
  candidate: { accountId: string; amount: string; currency: string; occurredAt: Date },
): Promise<TransactionDTO[]> {
  const amountMinor = parseAmountForCurrency(candidate.amount, candidate.currency, actor.locale);
  const rows = await repo.findPossibleDuplicates(actor.userId, {
    accountId: candidate.accountId,
    amountMinor,
    occurredAt: candidate.occurredAt,
  });
  return rows.map(toTransactionDTO);
}
