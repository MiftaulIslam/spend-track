import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  budgetCategories,
  categories,
  merchants,
  transactionSplits,
  transactions,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, PreconditionError, ValidationError } from "@/src/server/errors";
import * as audit from "./audit-service";
import { slugify } from "./tag-service";
import type { CreateCategoryInput } from "./category-types";

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  kind: string;
  parentId: string | null;
  colorIndex: number;
  icon: string;
  sortOrder: number;
  isSystem: boolean;
  archivedAt: string | null;
  transactionCount: number;
  children: CategoryNode[];
}

export async function tree(
  actor: ActorContext,
  options: { kind?: "EXPENSE" | "INCOME" | "TRANSFER"; includeArchived?: boolean } = {},
): Promise<CategoryNode[]> {
  // The transaction count joins in the same statement rather than one query
  // per category, which for a 60-category tree is the whole cost of the page.
  const rows = await rootDb
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      kind: categories.kind,
      parentId: categories.parentId,
      colorIndex: categories.colorIndex,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      isSystem: categories.isSystem,
      archivedAt: categories.archivedAt,
      _count: { transactions: sql<number>`count(${transactions.id})::int` },
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(eq(transactions.categoryId, categories.id), isNull(transactions.deletedAt)),
    )
    .where(
      and(
        eq(categories.userId, actor.userId),
        options.kind ? eq(categories.kind, options.kind) : undefined,
        options.includeArchived ? undefined : isNull(categories.archivedAt),
      ),
    )
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const byId = new Map<string, CategoryNode>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id, name: r.name, slug: r.slug, kind: r.kind, parentId: r.parentId,
      colorIndex: r.colorIndex, icon: r.icon, sortOrder: r.sortOrder, isSystem: r.isSystem,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      transactionCount: r._count.transactions,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Flat list for pickers — parents and children, each labelled with its path. */
export async function flat(
  actor: ActorContext,
  options: { kind?: "EXPENSE" | "INCOME" | "TRANSFER" } = {},
) {
  const nodes = await tree(actor, options);
  const out: Array<{ id: string; label: string; name: string; colorIndex: number; icon: string; kind: string; parentId: string | null }> = [];

  const walk = (node: CategoryNode, prefix: string) => {
    const label = prefix ? `${prefix} › ${node.name}` : node.name;
    out.push({
      id: node.id, label, name: node.name,
      colorIndex: node.colorIndex, icon: node.icon, kind: node.kind, parentId: node.parentId,
    });
    for (const child of node.children) walk(child, label);
  };
  for (const root of nodes) walk(root, "");
  return out;
}

async function uniqueSlug(userId: string, name: string, db: Db): Promise<string> {
  const base = slugify(name) || "category";
  let candidate = base;
  let n = 1;
  // The unique index is (userId, slug); collisions are common because users
  // create "Travel" under two different parents.
  while (
    await db.query.categories.findFirst({
      where: and(eq(categories.userId, userId), eq(categories.slug, candidate)),
      columns: { id: true },
    })
  ) {
    candidate = `${base}-${++n}`;
    if (n > 50) throw new ValidationError("Pick a different name for that category.");
  }
  return candidate;
}

export async function create(actor: ActorContext, input: CreateCategoryInput) {
  return withTransaction(rootDb, async (tx) => {
    if (input.parentId) {
      const parent = await tx.query.categories.findFirst({
        where: and(eq(categories.id, input.parentId), eq(categories.userId, actor.userId)),
        columns: { id: true, parentId: true, kind: true },
      });
      if (!parent) throw new NotFoundError("That parent category");
      // Two levels is a deliberate limit: deeper trees make every picker and
      // every report grouping worse without making anything clearer.
      if (parent.parentId) throw new ValidationError("Categories only go two levels deep.");
    }

    const [order] = await tx
      .select({ max: max(categories.sortOrder) })
      .from(categories)
      .where(
        and(
          eq(categories.userId, actor.userId),
          input.parentId ? eq(categories.parentId, input.parentId) : isNull(categories.parentId),
        ),
      );

    const [created] = await tx
      .insert(categories)
      .values({
        userId: actor.userId,
        name: input.name,
        slug: await uniqueSlug(actor.userId, input.name, tx),
        kind: input.kind,
        parentId: input.parentId ?? null,
        colorIndex: input.colorIndex,
        icon: input.icon,
        sortOrder: (order?.max ?? 0) + 1,
      })
      .returning();
    if (!created) throw new NotFoundError("That category");

    await audit.record(
      actor,
      { action: "category.create", entityType: "Category", entityId: created.id, after: created },
      tx,
    );
    return created;
  });
}

export async function update(
  actor: ActorContext,
  id: string,
  input: Partial<CreateCategoryInput> & { sortOrder?: number },
) {
  const before = await rootDb.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, actor.userId)),
  });
  if (!before) throw new NotFoundError("That category");

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new ValidationError("A category can't be its own parent.");
    const parent = await rootDb.query.categories.findFirst({
      where: and(eq(categories.id, input.parentId), eq(categories.userId, actor.userId)),
      columns: { id: true, parentId: true },
    });
    if (!parent) throw new NotFoundError("That parent category");
    if (parent.parentId) throw new ValidationError("Categories only go two levels deep.");

    // Moving a parent under its own child would make a cycle the tree walker
    // never returns from.
    const children = await rootDb
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, id));
    if (children.some((c) => c.id === input.parentId)) {
      throw new ValidationError("That would put the category inside itself.");
    }
  }

  const [after] = await rootDb
    .update(categories)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.colorIndex !== undefined ? { colorIndex: input.colorIndex } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    .where(and(eq(categories.id, id), eq(categories.userId, actor.userId)))
    .returning();

  await audit.record(actor, { action: "category.update", entityType: "Category", entityId: id, before, after });
  return after;
}

/**
 * Archive rather than delete: 214 past transactions keep their category and
 * last year's report does not change shape because someone tidied a picker.
 */
export async function archive(actor: ActorContext, id: string) {
  const before = await rootDb.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, actor.userId)),
  });
  if (!before) throw new NotFoundError("That category");

  return withTransaction(rootDb, async (tx) => {
    const now = new Date();
    await tx
      .update(categories)
      .set({ archivedAt: now })
      .where(and(eq(categories.id, id), eq(categories.userId, actor.userId)));
    // Archiving a parent archives its children, or they become unreachable.
    await tx
      .update(categories)
      .set({ archivedAt: now })
      .where(and(eq(categories.parentId, id), eq(categories.userId, actor.userId)));
    await audit.record(
      actor,
      { action: "category.archive", entityType: "Category", entityId: id, before, after: { archivedAt: now } },
      tx,
    );
  });
}

export async function unarchive(actor: ActorContext, id: string) {
  const rows = await rootDb
    .update(categories)
    .set({ archivedAt: null })
    .where(and(eq(categories.id, id), eq(categories.userId, actor.userId)))
    .returning({ id: categories.id });
  if (rows.length === 0) throw new NotFoundError("That category");
  await audit.record(actor, { action: "category.unarchive", entityType: "Category", entityId: id, after: { archivedAt: null } });
}

export async function remove(actor: ActorContext, id: string) {
  const [before] = await rootDb
    .select({
      id: categories.id,
      name: categories.name,
      isSystem: categories.isSystem,
      transactionCount: sql<number>`count(${transactions.id})::int`,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(eq(transactions.categoryId, categories.id), isNull(transactions.deletedAt)),
    )
    .where(and(eq(categories.id, id), eq(categories.userId, actor.userId)))
    .groupBy(categories.id);

  if (!before) throw new NotFoundError("That category");
  if (before.transactionCount > 0) {
    throw new PreconditionError(
      `${before.transactionCount} transactions use this category. Archive it, or merge it into another category.`,
    );
  }
  await rootDb
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, actor.userId)));
  await audit.record(actor, { action: "category.delete", entityType: "Category", entityId: id, before });
}

/** Move everything from one category to another, then remove the source. */
export async function merge(actor: ActorContext, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new ValidationError("Pick two different categories.");

  return withTransaction(rootDb, async (tx) => {
    const [source, target] = await Promise.all([
      tx.query.categories.findFirst({
        where: and(eq(categories.id, sourceId), eq(categories.userId, actor.userId)),
        columns: { id: true, name: true },
      }),
      tx.query.categories.findFirst({
        where: and(eq(categories.id, targetId), eq(categories.userId, actor.userId)),
        columns: { id: true, name: true },
      }),
    ]);
    if (!source || !target) throw new NotFoundError("That category");

    const movedRows = await tx
      .update(transactions)
      .set({ categoryId: targetId })
      .where(and(eq(transactions.userId, actor.userId), eq(transactions.categoryId, sourceId)))
      .returning({ id: transactions.id });
    const moved = { count: movedRows.length };

    await tx
      .update(transactionSplits)
      .set({ categoryId: targetId })
      .where(eq(transactionSplits.categoryId, sourceId));
    await tx
      .update(merchants)
      .set({ defaultCategoryId: targetId })
      .where(and(eq(merchants.userId, actor.userId), eq(merchants.defaultCategoryId, sourceId)));
    // A budget cannot hold two lines for the same category, so the source line
    // is dropped rather than moved onto a colliding unique index.
    await tx.delete(budgetCategories).where(eq(budgetCategories.categoryId, sourceId));
    await tx
      .update(categories)
      .set({ parentId: targetId })
      .where(eq(categories.parentId, sourceId));
    await tx
      .delete(categories)
      .where(and(eq(categories.id, sourceId), eq(categories.userId, actor.userId)));

    await audit.record(
      actor,
      {
        action: "category.merge",
        entityType: "Category",
        entityId: targetId,
        before: { merged: source.name },
        after: { into: target.name, transactionsMoved: moved.count },
      },
      tx,
    );

    return { moved: moved.count };
  });
}

export async function reorder(actor: ActorContext, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const owned = await rootDb
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, orderedIds), eq(categories.userId, actor.userId)));
  const ownedSet = new Set(owned.map((o) => o.id));

  // One transaction, so a half-applied order is never visible.
  await withTransaction(rootDb, async (tx) => {
    let index = 0;
    for (const id of orderedIds) {
      if (!ownedSet.has(id)) continue;
      await tx
        .update(categories)
        .set({ sortOrder: index++ })
        .where(and(eq(categories.id, id), eq(categories.userId, actor.userId)));
    }
  });
}
