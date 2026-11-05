import { and, count, eq, isNull, max, sql } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import { accounts } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { ConflictError, NotFoundError, PreconditionError, ValidationError } from "@/src/server/errors";
import * as repo from "@/src/server/repositories/account-repository";
import * as audit from "./audit-service";
import { createFxContext, toBase } from "./fx-service";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { isLiabilityAccount, owedAmount } from "@/src/domain/ledger";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type { CreateAccountInput } from "@/src/lib/schemas";
import * as z from "zod";
import { updateAccountSchema } from "@/src/lib/schemas";

export interface AccountDTO {
  id: string;
  name: string;
  type: string;
  currency: string;
  institution: string | null;
  mask: string | null;
  colorIndex: number;
  icon: string | null;
  sortOrder: number;
  /** Signed: negative on a liability you owe money on. */
  balance: MoneyDTO;
  /** Same balance expressed in the user's base currency. */
  balanceBase: MoneyDTO;
  /** Positive "amount owed" for a liability; equals `balance` for an asset. */
  owed: MoneyDTO;
  isLiability: boolean;
  creditLimit: MoneyDTO | null;
  available: MoneyDTO | null;
  utilisation: number | null;
  statementDay: number | null;
  paymentDueDay: number | null;
  aprBps: number | null;
  interestRateBps: number | null;
  visibility: string;
  excludeFromNetWorth: boolean;
  lastReconciledAt: string | null;
  archivedAt: string | null;
  needsReconcile: boolean;
}

const RECONCILE_STALE_DAYS = 14;

async function toDto(
  actor: ActorContext,
  row: repo.AccountRow,
  fx = createFxContext(actor.baseCurrency),
): Promise<AccountDTO> {
  const balance = money(row.cachedBalanceMinor, row.currency);
  const { amount: balanceBase } = await toBase(fx, balance, new Date());

  const limit = row.creditLimitMinor !== null ? money(row.creditLimitMinor, row.currency) : null;
  const shape = { id: row.id, type: row.type as never };
  const isLiability = isLiabilityAccount(shape);

  // Balances are signed (see domain/ledger.ts): a card you owe on is negative.
  // `owed` is the positive figure a statement shows, and available credit is
  // the limit plus the (negative) balance.
  const owed = money(owedAmount(shape, balance.minor), row.currency);
  const available = limit ? money(limit.minor + balance.minor, row.currency) : null;
  const utilisation =
    limit && limit.minor > 0n ? Number(owed.minor) / Number(limit.minor) : null;

  const staleSince = row.lastReconciledAt
    ? Date.now() - row.lastReconciledAt.getTime()
    : Number.POSITIVE_INFINITY;

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    institution: row.institution,
    mask: row.mask,
    colorIndex: row.colorIndex,
    icon: row.icon,
    sortOrder: row.sortOrder,
    balance: toDTO(balance),
    balanceBase: toDTO(balanceBase),
    owed: toDTO(owed),
    isLiability,
    creditLimit: limit ? toDTO(limit) : null,
    available: available ? toDTO(available) : null,
    utilisation,
    statementDay: row.statementDay,
    paymentDueDay: row.paymentDueDay,
    aprBps: row.aprBps,
    interestRateBps: row.interestRateBps,
    visibility: row.visibility,
    excludeFromNetWorth: row.excludeFromNetWorth,
    lastReconciledAt: row.lastReconciledAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    needsReconcile:
      !isLiability &&
      ["CHECKING", "SAVINGS", "CASH"].includes(row.type) &&
      staleSince > RECONCILE_STALE_DAYS * 86_400_000,
  };
}

export async function list(
  actor: ActorContext,
  options: { includeArchived?: boolean } = {},
): Promise<AccountDTO[]> {
  const rows = await repo.list(actor.userId, options);
  const fx = createFxContext(actor.baseCurrency);
  return Promise.all(rows.map((r) => toDto(actor, r, fx)));
}

export async function get(actor: ActorContext, id: string): Promise<AccountDTO> {
  const row = await repo.findById(actor.userId, id);
  if (!row) throw new NotFoundError("That account");
  return toDto(actor, row);
}

export async function create(actor: ActorContext, input: CreateAccountInput): Promise<AccountDTO> {
  const openingMinor = parseAmountForCurrency(input.openingBalance || "0", input.currency, actor.locale);
  const creditLimitMinor = input.creditLimit
    ? parseAmountForCurrency(input.creditLimit, input.currency, actor.locale)
    : null;

  if (creditLimitMinor !== null && creditLimitMinor < 0n) {
    throw new ValidationError("A credit limit can't be negative.", [
      { path: "creditLimit", message: "Enter a positive limit." },
    ]);
  }

  return withTransaction(rootDb, async (tx) => {
    const [order] = await tx
      .select({ max: max(accounts.sortOrder) })
      .from(accounts)
      .where(eq(accounts.userId, actor.userId));
    const maxOrder = { _max: { sortOrder: order?.max ?? null } };

    const [existing] = await tx
      .select({ n: count() })
      .from(accounts)
      .where(and(eq(accounts.userId, actor.userId), isNull(accounts.deletedAt)));
    const isFirst = (existing?.n ?? 0) === 0;

    const row = await repo.create(
      actor.userId,
      {
        name: input.name,
        type: input.type,
        currency: input.currency,
        institution: input.institution,
        mask: input.mask,
        colorIndex: input.colorIndex,
        icon: input.icon,
        openingBalanceMinor: openingMinor,
        // The cache starts equal to the opening balance because there are no
        // movements yet; every later write refreshes it inside its own tx.
        cachedBalanceMinor: openingMinor,
        creditLimitMinor,
        statementDay: input.statementDay,
        paymentDueDay: input.paymentDueDay,
        aprBps: input.aprBps,
        interestRateBps: input.interestRateBps,
        visibility: input.visibility,
        excludeFromNetWorth: input.excludeFromNetWorth,
        isDefault: isFirst,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
      tx,
    );

    await audit.record(
      actor,
      { action: "account.create", entityType: "Account", entityId: row.id, after: row },
      tx,
    );

    return toDto(actor, row);
  });
}

export async function update(
  actor: ActorContext,
  id: string,
  input: z.infer<typeof updateAccountSchema>,
): Promise<AccountDTO> {
  const before = await repo.findById(actor.userId, id);
  if (!before) throw new NotFoundError("That account");

  const creditLimitMinor =
    input.creditLimit !== undefined
      ? parseAmountForCurrency(input.creditLimit, before.currency, actor.locale)
      : undefined;

  return withTransaction(rootDb, async (tx) => {
    const row = await repo.update(
      actor.userId,
      id,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.institution !== undefined ? { institution: input.institution } : {}),
        ...(input.mask !== undefined ? { mask: input.mask } : {}),
        ...(input.colorIndex !== undefined ? { colorIndex: input.colorIndex } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(creditLimitMinor !== undefined ? { creditLimitMinor } : {}),
        ...(input.statementDay !== undefined ? { statementDay: input.statementDay } : {}),
        ...(input.paymentDueDay !== undefined ? { paymentDueDay: input.paymentDueDay } : {}),
        ...(input.aprBps !== undefined ? { aprBps: input.aprBps } : {}),
        ...(input.interestRateBps !== undefined ? { interestRateBps: input.interestRateBps } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.excludeFromNetWorth !== undefined ? { excludeFromNetWorth: input.excludeFromNetWorth } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      tx,
    );
    if (!row) throw new NotFoundError("That account");

    await audit.record(
      actor,
      { action: "account.update", entityType: "Account", entityId: id, before, after: row },
      tx,
    );
    return toDto(actor, row);
  });
}

export async function archive(actor: ActorContext, id: string): Promise<void> {
  const before = await repo.findById(actor.userId, id);
  if (!before) throw new NotFoundError("That account");

  await withTransaction(rootDb, async (tx) => {
    const ok = await repo.archive(actor.userId, id, tx);
    if (!ok) throw new ConflictError("That account is already archived.");
    await audit.record(
      actor,
      { action: "account.archive", entityType: "Account", entityId: id, before, after: { ...before, archivedAt: new Date() } },
      tx,
    );
  });
}

export async function unarchive(actor: ActorContext, id: string): Promise<void> {
  const ok = await repo.unarchive(actor.userId, id);
  if (!ok) throw new NotFoundError("That account");
  await audit.record(actor, { action: "account.unarchive", entityType: "Account", entityId: id, after: { archivedAt: null } });
}

/**
 * Deleting an account with history would orphan every transaction on it and
 * silently change past reports. Archiving is offered instead.
 */
export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await repo.findById(actor.userId, id);
  if (!before) throw new NotFoundError("That account");

  const txnCount = await repo.countTransactions(actor.userId, id);
  if (txnCount > 0) {
    throw new PreconditionError(
      `This account has ${txnCount.toLocaleString()} transactions. Archive it instead — that keeps your history intact.`,
    );
  }

  await withTransaction(rootDb, async (tx) => {
    await repo.softDelete(actor.userId, id, tx);
    await audit.record(
      actor,
      { action: "account.delete", entityType: "Account", entityId: id, before },
      tx,
    );
  });
}

/** Recompute from the ledger. Exposed so a user can force it after an import. */
export async function recalculateBalance(actor: ActorContext, id: string, db: Db = rootDb): Promise<MoneyDTO> {
  const row = await repo.findById(actor.userId, id, db);
  if (!row) throw new NotFoundError("That account");
  const balance = await repo.refreshCachedBalance(actor.userId, id, db);
  return toDTO(money(balance, row.currency));
}

export interface NetWorth {
  assets: MoneyDTO;
  liabilities: MoneyDTO;
  net: MoneyDTO;
  currency: string;
}

/**
 * Net worth. Each account's balance is converted from its own currency at
 * today's rate, then liabilities are subtracted — not stored as negatives,
 * because a credit-card balance of "what you owe" is the number a person
 * recognises on their statement.
 */
export async function netWorth(actor: ActorContext, db: Db = rootDb): Promise<NetWorth> {
  const rows = await repo.balancesByCurrency(actor.userId, db);
  const fx = createFxContext(actor.baseCurrency);
  const now = new Date();

  let assets = 0n;
  let liabilities = 0n;

  for (const row of rows) {
    if (row.excludeFromNetWorth) continue;
    const { amount } = await toBase(fx, money(row.balance, row.currency), now, db);
    // Liability balances are stored negative; `liabilities` is reported as the
    // positive amount owed, and net is assets − liabilities.
    if (isLiabilityAccount({ id: "", type: row.type as never })) liabilities += -amount.minor;
    else assets += amount.minor;
  }

  return {
    assets: toDTO(money(assets, actor.baseCurrency)),
    liabilities: toDTO(money(liabilities, actor.baseCurrency)),
    net: toDTO(money(assets - liabilities, actor.baseCurrency)),
    currency: actor.baseCurrency,
  };
}

export async function balanceHistory(
  actor: ActorContext,
  id: string,
  from: Date,
  to: Date,
): Promise<Array<{ date: string; balance: MoneyDTO }>> {
  const row = await repo.findById(actor.userId, id);
  if (!row) throw new NotFoundError("That account");
  const points = await repo.balanceHistory(actor.userId, id, from, to);
  return points.map((p) => ({
    date: p.day.toISOString().slice(0, 10),
    balance: toDTO(money(p.balance, row.currency)),
  }));
}

/**
 * Net-worth trend: one point per month.
 *
 * SQL produces a per-account, per-month closing balance in that account's own
 * currency; the conversion to base happens here, at each month's own rate, so a
 * multi-currency portfolio's history is not rewritten by today's FX move.
 */
export async function netWorthHistory(
  actor: ActorContext,
  months = 12,
  db: Db = rootDb,
): Promise<Array<{ month: string; net: MoneyDTO }>> {
  const result = await db.execute<{
    month: Date;
    currency: string;
    type: string;
    balance: string;
  }>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', now()) - make_interval(months => ${months - 1}),
        date_trunc('month', now()),
        '1 month'::interval
      ) AS month
    ),
    acc AS (
      SELECT a.id, a.type::text AS type, a.currency,
             COALESCE(a."openingBalanceMinor", 0) AS opening
      FROM accounts a
      WHERE a."userId" = ${actor.userId}
        AND a."deletedAt" IS NULL
        AND a."excludeFromNetWorth" = false
    )
    SELECT m.month,
           acc.currency,
           acc.type,
           acc.opening + COALESCE((
             SELECT SUM(t."amountMinor" * t.direction)::bigint
             FROM transactions t
             WHERE t."accountId" = acc.id
               AND t."deletedAt" IS NULL
               AND t.status <> 'VOID'
               AND t."occurredAt" < (m.month + '1 month'::interval)
           ), 0) AS balance
    FROM months m
    CROSS JOIN acc
    ORDER BY m.month
  `);

  const rows = result.rows.map((r) => ({
    ...r,
    month: r.month instanceof Date ? r.month : new Date(String(r.month)),
    balance: BigInt(r.balance),
  }));

  const fx = createFxContext(actor.baseCurrency);
  const byMonth = new Map<string, bigint>();

  for (const row of rows) {
    // Value each month's closing balance at that month's end.
    const asOf = new Date(row.month.getTime());
    asOf.setUTCMonth(asOf.getUTCMonth() + 1);
    asOf.setUTCDate(0);

    const { amount } = await toBase(fx, money(row.balance, row.currency), asOf, db);
    // Balances are already signed, so net worth is a straight sum.
    const key = row.month.toISOString().slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0n) + amount.minor);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, net]) => ({ month, net: toDTO(money(net, actor.baseCurrency)) }));
}
