import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  categories,
  merchantAliases,
  merchants,
  transactions,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError } from "@/src/server/errors";
import * as audit from "./audit-service";

/**
 * Merchants.
 *
 * Banks emit descriptors like `SQ *DI AN DI BROOKLYN` and `TST* BLUE BOTTLE 0412`.
 * Normalising those into one merchant is what makes "how much do I spend at
 * Blue Bottle" answerable at all, so the normaliser is the interesting part of
 * this file.
 */

/** Processor prefixes that carry no information about who was paid. */
const PROCESSOR_PREFIXES = [
  "SQ *", "SQ*", "TST*", "TST* ", "PAYPAL *", "PP*", "PAYPAL*",
  "SP ", "SP*", "IC*", "WL *", "EZPASS*", "AMZN MKTP", "AMAZON MKTPLACE",
  "POS ", "PURCHASE ", "DEBIT CARD PURCHASE ", "CHECKCARD ", "VISA PURCHASE ",
];

/** Trailing noise: store numbers, city/state pairs, dates, reference ids. */
const TRAILING_NOISE = [
  /\s+#\d+$/i,
  /\s+\d{3,}$/,
  /\s+[A-Z]{2}\s*$/,
  /\s+\d{2}\/\d{2}$/,
  /\s+(RECURRING|ONLINE|WEB|MOBILE|PAYMENT)$/i,
];

export function normaliseDescriptor(raw: string): string {
  let s = raw.toUpperCase().replace(/\s+/g, " ").trim();

  for (const prefix of PROCESSOR_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length).trim();
      break;
    }
  }

  // Strip a trailing city/state block, then repeated noise patterns.
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TRAILING_NOISE) {
      const next = s.replace(pattern, "").trim();
      if (next !== s && next.length >= 3) {
        s = next;
        changed = true;
      }
    }
  }

  return s.replace(/[^A-Z0-9 &'-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Title Case for display, preserving short all-caps words like "IKEA". */
export function displayName(normalised: string): string {
  return normalised
    .split(" ")
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0) + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

export interface ResolveMerchantInput {
  merchantId?: string;
  merchantName?: string;
  rawDescriptor?: string | null;
  db?: Db;
}

/**
 * Turn whatever the caller has — an id, a typed name, or a raw bank string —
 * into a merchant id, creating the merchant and recording the alias if needed.
 * Returns null when there is nothing to work with, which is a valid state.
 */
export async function resolveMerchant(
  actor: ActorContext,
  input: ResolveMerchantInput,
): Promise<string | null> {
  const db = input.db ?? rootDb;

  if (input.merchantId) {
    const owned = await db.query.merchants.findFirst({
      where: and(eq(merchants.id, input.merchantId), eq(merchants.userId, actor.userId)),
      columns: { id: true },
    });
    return owned?.id ?? null;
  }

  const source = input.merchantName ?? input.rawDescriptor;
  if (!source?.trim()) return null;

  const normalised = normaliseDescriptor(source);
  if (normalised.length < 2) return null;

  // An alias match is the strongest signal — it means a human confirmed this
  // descriptor belongs to this merchant at some point.
  if (input.rawDescriptor) {
    const aliasPattern = input.rawDescriptor.toUpperCase().replace(/\s+/g, " ").trim();
    const alias = await db.query.merchantAliases.findFirst({
      where: and(
        eq(merchantAliases.pattern, aliasPattern),
        inArray(
          merchantAliases.merchantId,
          db.select({ id: merchants.id }).from(merchants).where(eq(merchants.userId, actor.userId)),
        ),
      ),
      columns: { merchantId: true },
    });
    if (alias) return alias.merchantId;
  }

  const existing = await db.query.merchants.findFirst({
    where: and(eq(merchants.userId, actor.userId), eq(merchants.normalizedName, normalised)),
    columns: { id: true },
  });
  if (existing) {
    if (input.rawDescriptor) await ensureAlias(existing.id, input.rawDescriptor, db);
    return existing.id;
  }

  const [created] = await db
    .insert(merchants)
    .values({
      userId: actor.userId,
      name: input.merchantName?.trim() || displayName(normalised),
      normalizedName: normalised,
    })
    .returning({ id: merchants.id });
  if (!created) return null;
  if (input.rawDescriptor) await ensureAlias(created.id, input.rawDescriptor, db);
  return created.id;
}

async function ensureAlias(merchantId: string, rawDescriptor: string, db: Db): Promise<void> {
  const pattern = rawDescriptor.toUpperCase().replace(/\s+/g, " ").trim();
  if (!pattern) return;
  await db.insert(merchantAliases).values({ merchantId, pattern }).onConflictDoNothing();
}

/* ------------------------------------------------------------------ CRUD */

export async function list(
  actor: ActorContext,
  options: { search?: string; limit?: number } = {},
) {
  // Both counts are correlated subqueries rather than joins: joining two
  // one-to-many tables at once multiplies the rows and inflates both counts.
  const rows = await rootDb
    .select({
      id: merchants.id,
      name: merchants.name,
      normalizedName: merchants.normalizedName,
      mcc: merchants.mcc,
      logoUrl: merchants.logoUrl,
      website: merchants.website,
      defaultCategoryId: merchants.defaultCategoryId,
      categoryName: categories.name,
      categoryColor: categories.colorIndex,
      transactionCount: sql<number>`(
        SELECT count(*)::int FROM transactions t
        WHERE t."merchantId" = ${merchants.id} AND t."deletedAt" IS NULL
      )`,
      aliasCount: sql<number>`(
        SELECT count(*)::int FROM merchant_aliases a WHERE a."merchantId" = ${merchants.id}
      )`,
    })
    .from(merchants)
    .leftJoin(categories, eq(categories.id, merchants.defaultCategoryId))
    .where(
      and(
        eq(merchants.userId, actor.userId),
        options.search ? ilike(merchants.name, `%${options.search}%`) : undefined,
      ),
    )
    .orderBy(asc(merchants.name))
    .limit(Math.min(options.limit ?? 100, 500));

  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    normalizedName: m.normalizedName,
    mcc: m.mcc,
    logoUrl: m.logoUrl,
    website: m.website,
    defaultCategory: m.defaultCategoryId
      ? { id: m.defaultCategoryId, name: m.categoryName!, colorIndex: m.categoryColor! }
      : null,
    transactionCount: m.transactionCount,
    aliasCount: m.aliasCount,
  }));
}

/** Spend leaderboard — the query the analytics page actually needs. */
export async function topBySpend(
  actor: ActorContext,
  from: Date,
  to: Date,
  limit = 10,
) {
  const { topMerchants } = await import("@/src/server/repositories/transaction-repository");
  return topMerchants(actor.userId, from, to, limit);
}

export async function update(
  actor: ActorContext,
  id: string,
  input: { name?: string; defaultCategoryId?: string | null; website?: string | null; mcc?: string | null },
) {
  const before = await rootDb.query.merchants.findFirst({
    where: and(eq(merchants.id, id), eq(merchants.userId, actor.userId)),
    columns: { id: true, name: true, defaultCategoryId: true, website: true, mcc: true },
  });
  if (!before) throw new NotFoundError("That merchant");

  if (input.defaultCategoryId) {
    const category = await rootDb.query.categories.findFirst({
      where: and(
        eq(categories.id, input.defaultCategoryId),
        eq(categories.userId, actor.userId),
      ),
      columns: { id: true },
    });
    if (!category) throw new NotFoundError("That category");
  }

  const [after] = await rootDb
    .update(merchants)
    .set({
      ...(input.name !== undefined
        ? { name: input.name, normalizedName: normaliseDescriptor(input.name) }
        : {}),
      ...(input.defaultCategoryId !== undefined
        ? { defaultCategoryId: input.defaultCategoryId }
        : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.mcc !== undefined ? { mcc: input.mcc } : {}),
    })
    .where(and(eq(merchants.id, id), eq(merchants.userId, actor.userId)))
    .returning({
      id: merchants.id,
      name: merchants.name,
      defaultCategoryId: merchants.defaultCategoryId,
      website: merchants.website,
      mcc: merchants.mcc,
    });

  await audit.record(actor, {
    action: "merchant.update",
    entityType: "Merchant",
    entityId: id,
    before,
    after,
  });
  return after;
}

/**
 * Merge two merchants. Aliases and transactions move to the survivor, which is
 * how "Blue Bottle" and "BLUE BOTTLE COFFEE" stop being two rows in analytics.
 */
export async function merge(actor: ActorContext, sourceId: string, targetId: string): Promise<{ moved: number }> {
  if (sourceId === targetId) return { moved: 0 };

  return withTransaction(rootDb, async (tx) => {
    const [source, target] = await Promise.all([
      tx.query.merchants.findFirst({
        where: and(eq(merchants.id, sourceId), eq(merchants.userId, actor.userId)),
        columns: { id: true, name: true },
      }),
      tx.query.merchants.findFirst({
        where: and(eq(merchants.id, targetId), eq(merchants.userId, actor.userId)),
        columns: { id: true, name: true },
      }),
    ]);
    if (!source || !target) throw new NotFoundError("That merchant");

    const movedRows = await tx
      .update(transactions)
      .set({ merchantId: targetId })
      .where(and(eq(transactions.userId, actor.userId), eq(transactions.merchantId, sourceId)))
      .returning({ id: transactions.id });
    const moved = { count: movedRows.length };

    const aliases = await tx
      .select({ pattern: merchantAliases.pattern })
      .from(merchantAliases)
      .where(eq(merchantAliases.merchantId, sourceId));
    if (aliases.length) {
      await tx
        .insert(merchantAliases)
        .values(aliases.map((a) => ({ merchantId: targetId, pattern: a.pattern })))
        .onConflictDoNothing();
    }

    await tx
      .delete(merchants)
      .where(and(eq(merchants.id, sourceId), eq(merchants.userId, actor.userId)));

    await audit.record(
      actor,
      {
        action: "merchant.merge",
        entityType: "Merchant",
        entityId: targetId,
        before: { merged: source.name },
        after: { into: target.name, transactionsMoved: moved.count },
      },
      tx,
    );

    return { moved: moved.count };
  });
}

/** Transactions whose descriptor never matched a merchant — the review queue. */
export async function unmatched(actor: ActorContext, limit = 50) {
  const rows = await rootDb
    .select({
      id: transactions.id,
      rawDescriptor: transactions.rawDescriptor,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, actor.userId),
        isNull(transactions.merchantId),
        isNotNull(transactions.rawDescriptor),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(limit);

  // Group by normalised form so one decision maps many transactions.
  const groups = new Map<string, { descriptor: string; suggestion: string; count: number; transactionIds: string[] }>();
  for (const row of rows) {
    if (!row.rawDescriptor) continue;
    const normalised = normaliseDescriptor(row.rawDescriptor);
    const existing = groups.get(normalised);
    if (existing) {
      existing.count += 1;
      existing.transactionIds.push(row.id);
    } else {
      groups.set(normalised, {
        descriptor: row.rawDescriptor,
        suggestion: displayName(normalised),
        count: 1,
        transactionIds: [row.id],
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Accept a mapping from the review queue and backfill matching transactions. */
export async function mapDescriptor(
  actor: ActorContext,
  input: { descriptor: string; merchantName: string; categoryId?: string | null },
): Promise<{ merchantId: string; updated: number }> {
  return withTransaction(rootDb, async (tx) => {
    const merchantId = await resolveMerchant(actor, {
      merchantName: input.merchantName,
      rawDescriptor: input.descriptor,
      db: tx,
    });
    if (!merchantId) throw new NotFoundError("That merchant");

    if (input.categoryId) {
      await tx
        .update(merchants)
        .set({ defaultCategoryId: input.categoryId })
        .where(and(eq(merchants.id, merchantId), eq(merchants.userId, actor.userId)));
    }

    const normalised = normaliseDescriptor(input.descriptor);
    const candidates = await tx
      .select({
        id: transactions.id,
        rawDescriptor: transactions.rawDescriptor,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, actor.userId),
          isNull(transactions.merchantId),
          isNotNull(transactions.rawDescriptor),
          isNull(transactions.deletedAt),
        ),
      );
    const matching = candidates.filter((c) => normaliseDescriptor(c.rawDescriptor!) === normalised);

    if (matching.length > 0) {
      await tx
        .update(transactions)
        .set({
          merchantId,
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        })
        .where(
          and(
            inArray(
              transactions.id,
              matching.map((m) => m.id),
            ),
            eq(transactions.userId, actor.userId),
          ),
        );
    }

    await audit.record(
      actor,
      {
        action: "merchant.map_descriptor",
        entityType: "Merchant",
        entityId: merchantId,
        after: { descriptor: input.descriptor, transactionsUpdated: matching.length },
      },
      tx,
    );

    return { merchantId, updated: matching.length };
  });
}
