import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import {
  attachments,
  merchants,
  transactionSplits,
  transactionTags,
  transactions,
} from "@/src/server/db/schema";
import type { TransactionFilter } from "@/src/lib/schemas";
import { SPENDING_TYPES, REVERSAL_TYPES, INCOME_TYPES } from "@/src/domain/ledger";

/**
 * Transaction data access.
 *
 * The ledger is the table that grows without bound — hundreds of thousands of
 * rows per user is the design target. Everything here is keyset-paginated and
 * every aggregate is computed in SQL; nothing loads rows to count or add them.
 *
 * A note on the `::bigint` casts in the raw aggregates below. Postgres widens
 * `SUM(bigint)` to `numeric`, because a sum of int8 values can overflow int8,
 * and the driver returns `numeric` as a string. Without the cast the value
 * arrives as a string, satisfies a `bigint`-typed signature that nothing checks
 * at runtime, and fails on a write somewhere far away.
 */

export const TRANSACTION_COLUMNS = {
  id: true,
  accountId: true,
  type: true,
  status: true,
  direction: true,
  amountMinor: true,
  currency: true,
  accountAmountMinor: true,
  fxRate: true,
  baseAmountMinor: true,
  baseCurrency: true,
  occurredAt: true,
  postedAt: true,
  categoryId: true,
  merchantId: true,
  rawDescriptor: true,
  description: true,
  note: true,
  locationLabel: true,
  externalRef: true,
  isSplit: true,
  excludeFromBudget: true,
  needsReview: true,
  reversesTransactionId: true,
  transferId: true,
  recurringId: true,
  createdVia: true,
  createdAt: true,
  updatedAt: true,
} as const;

const RELATED = {
  account: {
    columns: { id: true, name: true, type: true, currency: true, colorIndex: true, mask: true },
  },
  category: { columns: { id: true, name: true, colorIndex: true, icon: true, kind: true } },
  merchant: { columns: { id: true, name: true, logoUrl: true } },
  transactionTags: {
    columns: {},
    with: { tag: { columns: { id: true, name: true, slug: true, colorIndex: true } } },
  },
} as const;

type RawRow = Awaited<ReturnType<typeof loadRows>>[number];

/**
 * The shape the service layer consumes.
 *
 * `tags` is flattened out of the join table and the two counts are folded in, so
 * callers never see the join rows. Keeping that translation here means the
 * services do not have to know the ledger has a many-to-many on tags.
 */
export type TransactionRow = Omit<RawRow, "transactionTags"> & {
  tags: Array<{ tag: { id: string; name: string; slug: string; colorIndex: number } }>;
  _count: { attachments: number; splits: number };
};

function loadRows(db: Db, where: SQL | undefined, orderBy: SQL[], limit: number) {
  return db.query.transactions.findMany({
    where,
    orderBy,
    limit,
    columns: TRANSACTION_COLUMNS,
    with: RELATED,
  });
}

/**
 * Attach the attachment and split counts.
 *
 * Two grouped queries over the page's ids, rather than a correlated subquery per
 * row: a page is at most 200 rows, so this is two index scans instead of four
 * hundred.
 */
async function withCounts(db: Db, rows: RawRow[]): Promise<TransactionRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [attachmentCounts, splitCounts] = await Promise.all([
    db
      .select({ transactionId: attachments.transactionId, n: sql<number>`count(*)::int` })
      .from(attachments)
      .where(inArray(attachments.transactionId, ids))
      .groupBy(attachments.transactionId),
    db
      .select({ transactionId: transactionSplits.transactionId, n: sql<number>`count(*)::int` })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, ids))
      .groupBy(transactionSplits.transactionId),
  ]);

  const byAttachment = new Map(attachmentCounts.map((r) => [r.transactionId, r.n]));
  const bySplit = new Map(splitCounts.map((r) => [r.transactionId, r.n]));

  return rows.map(({ transactionTags: tagRows, ...row }) => ({
    ...row,
    tags: tagRows,
    _count: {
      attachments: byAttachment.get(row.id) ?? 0,
      splits: bySplit.get(row.id) ?? 0,
    },
  }));
}

/* ------------------------------------------------------------------ where */

export function buildWhere(
  userId: string,
  filter: Partial<TransactionFilter>,
): SQL | undefined {
  const parts: Array<SQL | undefined> = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
  ];

  if (filter.accountIds?.length) parts.push(inArray(transactions.accountId, filter.accountIds));
  if (filter.categoryIds?.length) parts.push(inArray(transactions.categoryId, filter.categoryIds));
  if (filter.merchantIds?.length) parts.push(inArray(transactions.merchantId, filter.merchantIds));
  if (filter.types?.length) parts.push(inArray(transactions.type, filter.types as never));
  if (filter.statuses?.length) parts.push(inArray(transactions.status, filter.statuses as never));
  if (filter.uncategorised) parts.push(isNull(transactions.categoryId));
  if (filter.needsReview) parts.push(eq(transactions.needsReview, true));
  if (filter.includeTransfers === false) parts.push(isNull(transactions.transferId));
  if (filter.dateFrom) parts.push(gte(transactions.occurredAt, filter.dateFrom));
  if (filter.dateTo) parts.push(lte(transactions.occurredAt, filter.dateTo));

  if (filter.tagIds?.length) {
    // Uncorrelated: see the note on `ownedBill` in bill-service. The relational
    // query API aliases the outer table and would not rewrite a correlated
    // subquery built here.
    parts.push(
      inArray(
        transactions.id,
        rootDb
          .select({ id: transactionTags.transactionId })
          .from(transactionTags)
          .where(inArray(transactionTags.tagId, filter.tagIds)),
      ),
    );
  }

  if (filter.search) {
    const q = `%${filter.search}%`;
    parts.push(
      or(
        ilike(transactions.description, q),
        ilike(transactions.note, q),
        ilike(transactions.rawDescriptor, q),
        inArray(
          transactions.merchantId,
          rootDb.select({ id: merchants.id }).from(merchants).where(ilike(merchants.name, q)),
        ),
      ),
    );
  }

  return and(...parts);
}

function orderFor(sort: TransactionFilter["sort"]): SQL[] {
  switch (sort) {
    case "date_asc":
      return [asc(transactions.occurredAt), asc(transactions.id)];
    case "amount_desc":
      return [desc(transactions.amountMinor), desc(transactions.id)];
    case "amount_asc":
      return [asc(transactions.amountMinor), asc(transactions.id)];
    default:
      return [desc(transactions.occurredAt), desc(transactions.id)];
  }
}

/**
 * The cursor condition for a keyset page.
 *
 * Compares the sort key as a tuple — `(occurredAt, id) < (…)` — rather than
 * `occurredAt < …`, because two transactions can share a timestamp and a
 * single-column comparison would either skip one or repeat it forever.
 */
function cursorCondition(
  sort: TransactionFilter["sort"],
  anchor: { occurredAt: Date; amountMinor: bigint; id: string },
): SQL {
  switch (sort) {
    case "date_asc":
      return sql`(${transactions.occurredAt}, ${transactions.id}) > (${anchor.occurredAt}, ${anchor.id})`;
    case "amount_desc":
      return sql`(${transactions.amountMinor}, ${transactions.id}) < (${anchor.amountMinor}, ${anchor.id})`;
    case "amount_asc":
      return sql`(${transactions.amountMinor}, ${transactions.id}) > (${anchor.amountMinor}, ${anchor.id})`;
    default:
      return sql`(${transactions.occurredAt}, ${transactions.id}) < (${anchor.occurredAt}, ${anchor.id})`;
  }
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Keyset pagination. `OFFSET 50000` makes Postgres walk 50,000 rows to throw
 * them away; a cursor on the same index the ORDER BY uses stays O(limit) at any
 * depth.
 */
export async function listPage(
  userId: string,
  filter: TransactionFilter,
  db: Db = rootDb,
): Promise<Page<TransactionRow>> {
  const limit = Math.min(filter.limit ?? 50, 200);
  let where = buildWhere(userId, filter);

  if (filter.cursor) {
    const anchor = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, filter.cursor), eq(transactions.userId, userId)),
      columns: { occurredAt: true, amountMinor: true, id: true },
    });
    // A cursor for a row that no longer exists (deleted between pages) falls
    // back to the first page rather than returning nothing.
    if (anchor) where = and(where, cursorCondition(filter.sort, anchor));
  }

  const rows = await loadRows(db, where, orderFor(filter.sort), limit + 1);
  const hasMore = rows.length > limit;
  const items = await withCounts(db, rows.slice(0, limit));
  return { items, hasMore, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export interface TransactionDetail extends TransactionRow {
  splits: Array<{
    id: string;
    categoryId: string | null;
    amountMinor: bigint;
    baseAmountMinor: bigint;
    note: string | null;
    owedByLabel: string | null;
    settledAt: Date | null;
    sortOrder: number;
    category: { id: string; name: string; colorIndex: number } | null;
  }>;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
  }>;
  receipt: {
    id: string;
    status: string;
    confidence: number | null;
    merchantName: string | null;
    totalMinor: bigint | null;
    taxMinor: bigint | null;
    tipMinor: bigint | null;
  } | null;
  transfer: {
    id: string;
    kind: string;
    fromAccountId: string;
    toAccountId: string;
    fromAmountMinor: bigint;
    toAmountMinor: bigint;
    fromCurrency: string;
    toCurrency: string;
    fxRate: string | null;
  } | null;
}

export async function findById(
  userId: string,
  id: string,
  db: Db = rootDb,
): Promise<TransactionDetail | null> {
  const row = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.id, id),
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
    ),
    columns: TRANSACTION_COLUMNS,
    with: {
      ...RELATED,
      transactionSplits: {
        columns: {
          id: true,
          categoryId: true,
          amountMinor: true,
          baseAmountMinor: true,
          note: true,
          owedByLabel: true,
          settledAt: true,
          sortOrder: true,
        },
        orderBy: [asc(transactionSplits.sortOrder)],
        with: { category: { columns: { id: true, name: true, colorIndex: true } } },
      },
      attachments: {
        columns: {
          id: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
      receipts: {
        columns: {
          id: true,
          status: true,
          confidence: true,
          merchantName: true,
          totalMinor: true,
          taxMinor: true,
          tipMinor: true,
        },
        limit: 1,
      },
      transfer: {
        columns: {
          id: true,
          kind: true,
          fromAccountId: true,
          toAccountId: true,
          fromAmountMinor: true,
          toAmountMinor: true,
          fromCurrency: true,
          toCurrency: true,
          fxRate: true,
        },
      },
    },
  });
  if (!row) return null;

  const { transactionTags: tagRows, transactionSplits: splits, receipts, ...rest } = row;
  const [counted] = await withCounts(db, [{ ...rest, transactionTags: tagRows } as RawRow]);

  return {
    ...(counted as TransactionRow),
    splits,
    attachments: row.attachments,
    receipt: receipts[0] ?? null,
    transfer: row.transfer,
  } as TransactionDetail;
}

export async function findManyByIds(
  userId: string,
  ids: readonly string[],
  db: Db = rootDb,
): Promise<TransactionRow[]> {
  if (ids.length === 0) return [];
  const rows = await loadRows(
    db,
    and(
      inArray(transactions.id, [...ids]),
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
    ),
    orderFor("date_desc"),
    ids.length,
  );
  return withCounts(db, rows);
}

export async function count(
  userId: string,
  filter: Partial<TransactionFilter>,
  db: Db = rootDb,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(buildWhere(userId, filter));
  return rows[0]?.n ?? 0;
}

export async function create(
  data: typeof transactions.$inferInsert,
  db: Db = rootDb,
): Promise<{ id: string }> {
  const [row] = await db.insert(transactions).values(data).returning({ id: transactions.id });
  return row!;
}

export async function update(
  userId: string,
  id: string,
  data: Partial<typeof transactions.$inferInsert>,
  db: Db = rootDb,
): Promise<boolean> {
  const rows = await db
    .update(transactions)
    .set(data)
    .where(
      and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt)),
    )
    .returning({ id: transactions.id });
  return rows.length > 0;
}

export async function softDelete(
  userId: string,
  ids: readonly string[],
  db: Db = rootDb,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, [...ids]),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    )
    .returning({ id: transactions.id });
  return rows.length;
}

export async function restore(
  userId: string,
  ids: readonly string[],
  db: Db = rootDb,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(transactions)
    .set({ deletedAt: null })
    .where(
      and(
        inArray(transactions.id, [...ids]),
        eq(transactions.userId, userId),
        isNotNull(transactions.deletedAt),
      ),
    )
    .returning({ id: transactions.id });
  return rows.length;
}

/* -------------------------------------------------------------- aggregates */

export interface Totals {
  spendingMinor: bigint;
  incomeMinor: bigint;
  count: number;
}

/**
 * Spending and income for a window.
 *
 * The type lists come from the ledger module so this can never disagree with
 * the rest of the app about whether a transfer is spending.
 */
export async function totals(
  userId: string,
  filter: Partial<TransactionFilter>,
  db: Db = rootDb,
): Promise<Totals> {
  const rows = await db
    .select({ type: transactions.type, baseAmountMinor: transactions.baseAmountMinor })
    .from(transactions)
    .where(buildWhere(userId, filter));

  let spendingMinor = 0n;
  let incomeMinor = 0n;
  for (const r of rows) {
    if (SPENDING_TYPES.includes(r.type as never)) spendingMinor += r.baseAmountMinor;
    else if (REVERSAL_TYPES.includes(r.type as never)) spendingMinor -= r.baseAmountMinor;
    else if (INCOME_TYPES.includes(r.type as never)) incomeMinor += r.baseAmountMinor;
  }
  return { spendingMinor, incomeMinor, count: rows.length };
}

/** Enum lists, inlined as a typed SQL fragment for the raw aggregates. */
const typeList = (types: readonly string[]) =>
  sql.join(
    types.map((t) => sql`${t}::"TransactionType"`),
    sql`, `,
  );

const SPENDING_SQL = typeList(SPENDING_TYPES);
const REVERSAL_SQL = typeList(REVERSAL_TYPES);
const INCOME_SQL = typeList(INCOME_TYPES);

/** The same totals entirely in SQL — used where the row count is large. */
export async function totalsSql(
  userId: string,
  from: Date,
  to: Date,
  db: Db = rootDb,
): Promise<Totals> {
  const result = await db.execute<{ spending: string; income: string; count: string }>(sql`
    SELECT
      (COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN (${SPENDING_SQL})), 0)
        - COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN (${REVERSAL_SQL})), 0))::bigint AS spending,
      COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN (${INCOME_SQL})), 0)::bigint AS income,
      COUNT(*) AS count
    FROM transactions
    WHERE "userId" = ${userId}
      AND "deletedAt" IS NULL
      AND status <> 'VOID'
      AND "occurredAt" >= ${from}
      AND "occurredAt" < ${to}
  `);
  const row = result.rows[0];
  return {
    spendingMinor: BigInt(row?.spending ?? 0),
    incomeMinor: BigInt(row?.income ?? 0),
    count: Number(row?.count ?? 0),
  };
}

/** Spend per category for a window. Drives budgets and the donut. */
export async function spendingByCategory(
  userId: string,
  from: Date,
  to: Date,
  options: { categoryIds?: string[]; excludeFlagged?: boolean } = {},
  db: Db = rootDb,
): Promise<
  Array<{
    categoryId: string | null;
    name: string | null;
    colorIndex: number | null;
    spendingMinor: bigint;
    count: number;
  }>
> {
  const categoryFilter = options.categoryIds?.length
    ? sql`AND t."categoryId" IN (${sql.join(
        options.categoryIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const flaggedFilter = options.excludeFlagged ? sql`AND t."excludeFromBudget" = false` : sql``;

  const result = await db.execute<{
    categoryId: string | null;
    name: string | null;
    colorIndex: number | null;
    spending: string;
    count: string;
  }>(sql`
    SELECT t."categoryId",
           c.name,
           c."colorIndex",
           (COALESCE(SUM(t."baseAmountMinor") FILTER (WHERE t.type IN (${SPENDING_SQL})), 0)
             - COALESCE(SUM(t."baseAmountMinor") FILTER (WHERE t.type IN (${REVERSAL_SQL})), 0))::bigint AS spending,
           COUNT(*) AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t."categoryId"
    WHERE t."userId" = ${userId}
      AND t."deletedAt" IS NULL
      AND t.status <> 'VOID'
      AND t."occurredAt" >= ${from}
      AND t."occurredAt" < ${to}
      AND t.type IN (${SPENDING_SQL}, ${REVERSAL_SQL})
      ${categoryFilter}
      ${flaggedFilter}
    GROUP BY t."categoryId", c.name, c."colorIndex"
    HAVING COALESCE(SUM(t."baseAmountMinor"), 0)::bigint <> 0
    ORDER BY spending DESC
  `);

  return result.rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    colorIndex: r.colorIndex,
    spendingMinor: BigInt(r.spending),
    count: Number(r.count),
  }));
}

/** Monthly in/out series for the cash-flow chart. */
export async function monthlyFlow(
  userId: string,
  from: Date,
  to: Date,
  db: Db = rootDb,
): Promise<Array<{ month: Date; incomeMinor: bigint; spendingMinor: bigint }>> {
  const result = await db.execute<{ month: Date; income: string; spending: string }>(sql`
    SELECT date_trunc('month', "occurredAt") AS month,
           COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN (${INCOME_SQL})), 0)::bigint AS income,
           (COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN (${SPENDING_SQL})), 0)
             - COALESCE(SUM("baseAmountMinor") FILTER (WHERE type IN (${REVERSAL_SQL})), 0))::bigint AS spending
    FROM transactions
    WHERE "userId" = ${userId}
      AND "deletedAt" IS NULL
      AND status <> 'VOID'
      AND "occurredAt" >= ${from}
      AND "occurredAt" < ${to}
    GROUP BY 1
    ORDER BY 1
  `);
  return result.rows.map((r) => ({
    month: r.month instanceof Date ? r.month : new Date(String(r.month)),
    incomeMinor: BigInt(r.income),
    spendingMinor: BigInt(r.spending),
  }));
}

/** The merchants a user spends most with, for the analytics page. */
export async function topMerchants(
  userId: string,
  from: Date,
  to: Date,
  limit = 10,
  db: Db = rootDb,
): Promise<Array<{ merchantId: string; name: string; totalMinor: bigint; count: number }>> {
  const result = await db.execute<{
    merchantId: string;
    name: string;
    total: string;
    count: string;
  }>(sql`
    SELECT t."merchantId", m.name,
           COALESCE(SUM(t."baseAmountMinor"), 0)::bigint AS total,
           COUNT(*) AS count
    FROM transactions t
    JOIN merchants m ON m.id = t."merchantId"
    WHERE t."userId" = ${userId}
      AND t."deletedAt" IS NULL
      AND t.status <> 'VOID'
      AND t.type IN (${SPENDING_SQL})
      AND t."occurredAt" >= ${from}
      AND t."occurredAt" < ${to}
    GROUP BY t."merchantId", m.name
    ORDER BY total DESC
    LIMIT ${limit}
  `);
  return result.rows.map((r) => ({
    merchantId: r.merchantId,
    name: r.name,
    totalMinor: BigInt(r.total),
    count: Number(r.count),
  }));
}

/**
 * Duplicate detection for import and for the "possible duplicate" warning.
 * Matches on account + amount + a date window, which is what a bank statement
 * can actually be compared on — the description text differs between exports.
 */
export async function findPossibleDuplicates(
  userId: string,
  candidate: { accountId: string; amountMinor: bigint; occurredAt: Date; windowDays?: number },
  db: Db = rootDb,
): Promise<TransactionRow[]> {
  const window = (candidate.windowDays ?? 1) * 86_400_000;
  const rows = await loadRows(
    db,
    and(
      eq(transactions.userId, userId),
      eq(transactions.accountId, candidate.accountId),
      eq(transactions.amountMinor, candidate.amountMinor),
      isNull(transactions.deletedAt),
      gte(transactions.occurredAt, new Date(candidate.occurredAt.getTime() - window)),
      lte(transactions.occurredAt, new Date(candidate.occurredAt.getTime() + window)),
    ),
    orderFor("date_desc"),
    5,
  );
  return withCounts(db, rows);
}

/** Recent history for a merchant — powers categorisation suggestions. */
export function recentForMerchant(
  userId: string,
  merchantId: string,
  limit = 10,
  db: Db = rootDb,
): Promise<Array<{ categoryId: string | null; amountMinor: bigint; occurredAt: Date }>> {
  return db
    .select({
      categoryId: transactions.categoryId,
      amountMinor: transactions.amountMinor,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.merchantId, merchantId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(limit);
}

/** Exported for the few callers that need the raw `lt` on a cursor tuple. */
export { lt };
