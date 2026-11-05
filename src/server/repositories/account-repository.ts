import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { accounts, transactions } from "@/src/server/db/schema";

/**
 * Account data access.
 *
 * Every read takes `userId` and puts it in the WHERE clause. There is no
 * fetch-then-check anywhere in this file: fetch-then-check leaks whether an id
 * exists through response timing and error shape, and it is one forgotten `if`
 * away from a data leak.
 */

/** The columns every caller gets. Secrets and internal bookkeeping stay out. */
export const ACCOUNT_COLUMNS = {
  id: true,
  name: true,
  type: true,
  currency: true,
  institution: true,
  mask: true,
  colorIndex: true,
  icon: true,
  sortOrder: true,
  openingBalanceMinor: true,
  cachedBalanceMinor: true,
  cachedBalanceAt: true,
  creditLimitMinor: true,
  statementDay: true,
  paymentDueDay: true,
  aprBps: true,
  interestRateBps: true,
  visibility: true,
  isDefault: true,
  excludeFromNetWorth: true,
  lastReconciledAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AccountRow = Pick<typeof accounts.$inferSelect, keyof typeof ACCOUNT_COLUMNS>;
export type AccountInsert = Omit<typeof accounts.$inferInsert, "userId">;
export type AccountUpdate = Partial<Omit<typeof accounts.$inferInsert, "id" | "userId">>;

const alive = (userId: string) => and(eq(accounts.userId, userId), isNull(accounts.deletedAt));

export function findById(userId: string, id: string, db: Db = rootDb): Promise<AccountRow | undefined> {
  return db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), alive(userId)),
    columns: ACCOUNT_COLUMNS,
  });
}

/** Resolve several ids at once, for a batch operation or an AI tool call. */
export function findManyByIds(
  userId: string,
  ids: readonly string[],
  db: Db = rootDb,
): Promise<AccountRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db.query.accounts.findMany({
    where: and(inArray(accounts.id, [...ids]), alive(userId)),
    columns: ACCOUNT_COLUMNS,
  });
}

export function list(
  userId: string,
  options: { includeArchived?: boolean; types?: string[] } = {},
  db: Db = rootDb,
): Promise<AccountRow[]> {
  return db.query.accounts.findMany({
    where: and(
      alive(userId),
      options.includeArchived ? undefined : isNull(accounts.archivedAt),
      options.types?.length
        ? inArray(accounts.type, options.types as (typeof accounts.type.enumValues)[number][])
        : undefined,
    ),
    orderBy: [asc(accounts.sortOrder), asc(accounts.createdAt)],
    columns: ACCOUNT_COLUMNS,
  });
}

/** Accounts visible to a household member, respecting per-account visibility. */
export function listForHousehold(
  memberUserIds: readonly string[],
  viewerUserId: string,
  db: Db = rootDb,
): Promise<AccountRow[]> {
  return db.query.accounts.findMany({
    where: and(
      isNull(accounts.deletedAt),
      isNull(accounts.archivedAt),
      or(
        eq(accounts.userId, viewerUserId),
        and(
          inArray(accounts.userId, [...memberUserIds]),
          eq(accounts.visibility, "HOUSEHOLD"),
        ),
      ),
    ),
    orderBy: [asc(accounts.sortOrder), asc(accounts.createdAt)],
    columns: ACCOUNT_COLUMNS,
  });
}

export async function create(
  userId: string,
  data: AccountInsert,
  db: Db = rootDb,
): Promise<AccountRow> {
  const [row] = await db
    .insert(accounts)
    .values({ ...data, userId })
    .returning();
  return row as AccountRow;
}

/**
 * Update scoped by userId. Ownership is part of the WHERE clause — an update by
 * id alone would happily write to someone else's row.
 */
export async function update(
  userId: string,
  id: string,
  data: AccountUpdate,
  db: Db = rootDb,
): Promise<AccountRow | undefined> {
  const [row] = await db
    .update(accounts)
    .set(data)
    .where(and(eq(accounts.id, id), alive(userId)))
    .returning();
  return row as AccountRow | undefined;
}

export async function archive(userId: string, id: string, db: Db = rootDb): Promise<boolean> {
  const rows = await db
    .update(accounts)
    .set({ archivedAt: new Date() })
    .where(and(eq(accounts.id, id), alive(userId), isNull(accounts.archivedAt)))
    .returning({ id: accounts.id });
  return rows.length > 0;
}

export async function unarchive(userId: string, id: string, db: Db = rootDb): Promise<boolean> {
  const rows = await db
    .update(accounts)
    .set({ archivedAt: null })
    .where(and(eq(accounts.id, id), alive(userId)))
    .returning({ id: accounts.id });
  return rows.length > 0;
}

export async function softDelete(userId: string, id: string, db: Db = rootDb): Promise<boolean> {
  const rows = await db
    .update(accounts)
    .set({ deletedAt: new Date() })
    .where(and(eq(accounts.id, id), alive(userId)))
    .returning({ id: accounts.id });
  return rows.length > 0;
}

export async function countTransactions(
  userId: string,
  accountId: string,
  db: Db = rootDb,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.accountId, accountId),
        isNull(transactions.deletedAt),
      ),
    );
  return rows[0]?.n ?? 0;
}

/**
 * Recompute a balance from the ledger.
 *
 * The aggregate lives in SQL because loading 200,000 rows into Node to add them
 * up is both slow and pointless — and because doing it in one statement lets it
 * run inside the same transaction as the write that triggered it, which is what
 * keeps the cache from ever being wrong.
 *
 * Note the `::bigint` casts throughout this file. Postgres widens `SUM(bigint)`
 * to `numeric` (a sum of int8 can overflow int8), and the driver hands `numeric`
 * back as a string. Without the cast the value arrives as a string, silently
 * passes a `bigint`-typed signature, and fails much later on a write.
 */
export async function computeBalanceMinor(
  userId: string,
  accountId: string,
  db: Db = rootDb,
): Promise<bigint> {
  const rows = await db.execute<{ balance: string | null }>(sql`
    SELECT
      COALESCE(a."openingBalanceMinor", 0)
      + COALESCE(SUM(t."amountMinor" * t.direction), 0)::bigint AS balance
    FROM accounts a
    LEFT JOIN transactions t
      ON t."accountId" = a.id
     AND t."deletedAt" IS NULL
     AND t.status <> 'VOID'
    WHERE a.id = ${accountId} AND a."userId" = ${userId}
    GROUP BY a.id, a."openingBalanceMinor"
  `);
  const balance = rows.rows[0]?.balance;
  return balance == null ? 0n : BigInt(balance);
}

export async function refreshCachedBalance(
  userId: string,
  accountId: string,
  db: Db = rootDb,
): Promise<bigint> {
  const balance = await computeBalanceMinor(userId, accountId, db);
  await db
    .update(accounts)
    .set({ cachedBalanceMinor: balance, cachedBalanceAt: new Date() })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  return balance;
}

/** Balance history for the account chart — one point per day, in SQL. */
export async function balanceHistory(
  userId: string,
  accountId: string,
  from: Date,
  to: Date,
  db: Db = rootDb,
): Promise<Array<{ day: Date; balance: bigint }>> {
  const result = await db.execute<{ day: Date; balance: string | null }>(sql`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, '1 day'::interval)::date AS day
    ),
    opening AS (
      SELECT COALESCE("openingBalanceMinor", 0) AS amount
      FROM accounts WHERE id = ${accountId} AND "userId" = ${userId}
    ),
    movements AS (
      SELECT date_trunc('day', t."occurredAt")::date AS day,
             SUM(t."amountMinor" * t.direction)::bigint AS delta
      FROM transactions t
      WHERE t."accountId" = ${accountId}
        AND t."userId" = ${userId}
        AND t."deletedAt" IS NULL
        AND t.status <> 'VOID'
        AND t."occurredAt" <= ${to}
      GROUP BY 1
    )
    SELECT d.day,
           (SELECT amount FROM opening)
           + COALESCE(SUM(m.delta) OVER (ORDER BY d.day), 0)::bigint AS balance
    FROM days d
    LEFT JOIN movements m ON m.day = d.day
    ORDER BY d.day
  `);
  return result.rows.map((r) => ({
    day: r.day instanceof Date ? r.day : new Date(String(r.day)),
    balance: r.balance == null ? 0n : BigInt(r.balance),
  }));
}

/** Net worth split into assets and liabilities, converted at read time. */
export async function balancesByCurrency(
  userId: string,
  db: Db = rootDb,
): Promise<Array<{ currency: string; type: string; balance: bigint; excludeFromNetWorth: boolean }>> {
  const result = await db.execute<{
    currency: string;
    type: string;
    balance: string | null;
    excludeFromNetWorth: boolean;
  }>(sql`
    SELECT a.currency,
           a.type::text AS type,
           a."excludeFromNetWorth",
           COALESCE(a."openingBalanceMinor", 0)
             + COALESCE(SUM(t."amountMinor" * t.direction), 0)::bigint AS balance
    FROM accounts a
    LEFT JOIN transactions t
      ON t."accountId" = a.id AND t."deletedAt" IS NULL AND t.status <> 'VOID'
    WHERE a."userId" = ${userId} AND a."deletedAt" IS NULL AND a."archivedAt" IS NULL
    GROUP BY a.id, a.currency, a.type, a."excludeFromNetWorth"
  `);
  return result.rows.map((r) => ({
    currency: r.currency,
    type: r.type,
    balance: r.balance == null ? 0n : BigInt(r.balance),
    excludeFromNetWorth: r.excludeFromNetWorth,
  }));
}
