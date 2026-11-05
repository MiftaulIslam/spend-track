import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { tags, transactionTags } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError } from "@/src/server/errors";
import * as audit from "./audit-service";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Turn a mixed bag of tag ids and free-typed tag names into owned tag ids,
 * creating any that don't exist yet.
 *
 * Ids that don't belong to the actor are dropped rather than rejected: this is
 * called with model-supplied ids from AI tool calls, and silently scoping to
 * what the actor owns is safer than trusting the input.
 */
export async function resolveTags(
  actor: ActorContext,
  input: { tagIds?: string[]; tagNames?: string[]; db?: Db },
): Promise<string[]> {
  const db = input.db ?? rootDb;
  const result = new Set<string>();

  if (input.tagIds?.length) {
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, input.tagIds), eq(tags.userId, actor.userId)));
    for (const t of owned) result.add(t.id);
  }

  for (const rawName of input.tagNames ?? []) {
    const name = rawName.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;

    const existing = await db.query.tags.findFirst({
      where: and(eq(tags.userId, actor.userId), eq(tags.slug, slug)),
      columns: { id: true },
    });
    if (existing) {
      result.add(existing.id);
      continue;
    }

    const [created] = await db
      .insert(tags)
      .values({ userId: actor.userId, name, slug, colorIndex: 12 })
      .returning({ id: tags.id });
    result.add(created!.id);
  }

  return [...result];
}

export async function list(actor: ActorContext) {
  // The tag count comes from the join table in the same statement, so the list
  // is one query rather than one per tag.
  const rows = await rootDb
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      colorIndex: tags.colorIndex,
      transactionCount: sql<number>`count(${transactionTags.transactionId})::int`,
    })
    .from(tags)
    .leftJoin(transactionTags, eq(transactionTags.tagId, tags.id))
    .where(eq(tags.userId, actor.userId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  return rows;
}

export async function create(actor: ActorContext, input: { name: string; colorIndex?: number }) {
  const slug = slugify(input.name);
  const existing = await rootDb.query.tags.findFirst({
    where: and(eq(tags.userId, actor.userId), eq(tags.slug, slug)),
  });
  if (existing) return existing;

  const [tag] = await rootDb
    .insert(tags)
    .values({
      userId: actor.userId,
      name: input.name.trim(),
      slug,
      colorIndex: input.colorIndex ?? 12,
    })
    .returning();
  if (!tag) throw new NotFoundError("That tag");
  await audit.record(actor, { action: "tag.create", entityType: "Tag", entityId: tag.id, after: tag });
  return tag;
}

export async function rename(actor: ActorContext, id: string, name: string) {
  const before = await rootDb.query.tags.findFirst({
    where: and(eq(tags.id, id), eq(tags.userId, actor.userId)),
  });
  if (!before) throw new NotFoundError("That tag");

  const [after] = await rootDb
    .update(tags)
    .set({ name: name.trim(), slug: slugify(name) })
    .where(and(eq(tags.id, id), eq(tags.userId, actor.userId)))
    .returning();
  await audit.record(actor, { action: "tag.update", entityType: "Tag", entityId: id, before, after });
  return after;
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.tags.findFirst({
    where: and(eq(tags.id, id), eq(tags.userId, actor.userId)),
  });
  if (!before) throw new NotFoundError("That tag");

  // The join rows cascade; the transactions themselves are untouched.
  await rootDb.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, actor.userId)));
  await audit.record(actor, { action: "tag.delete", entityType: "Tag", entityId: id, before });
}
