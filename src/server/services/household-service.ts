import { and, eq, isNull } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { householdMembers, households, users } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { ForbiddenError } from "@/src/server/errors";
import * as audit from "./audit-service";

/**
 * Households.
 *
 * A household is a shared view, not a shared account: every transaction still
 * belongs to the user who created it, and `visibility` on each record decides
 * whether the rest of the household sees it. That is why removing a member
 * stamps `removedAt` instead of deleting the row — their own history is theirs,
 * and the membership is only the reason others could read it.
 */

export interface HouseholdMemberDTO {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  joinedAt: string;
  isYou: boolean;
}

export interface HouseholdDTO {
  id: string;
  name: string;
  baseCurrency: string;
  ownerId: string;
  createdAt: string;
  members: HouseholdMemberDTO[];
}

/** Null when the user is not in a household — the common case, not an error. */
export async function get(actor: ActorContext, db: Db = rootDb): Promise<HouseholdDTO | null> {
  if (!actor.householdId) return null;

  const household = await db.query.households.findFirst({
    where: and(eq(households.id, actor.householdId), isNull(households.deletedAt)),
  });
  if (!household) return null;

  const rows = await db
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, household.id), isNull(householdMembers.removedAt)));

  return {
    id: household.id,
    name: household.name,
    baseCurrency: household.baseCurrency,
    ownerId: household.ownerId,
    createdAt: household.createdAt.toISOString(),
    members: rows
      .map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        image: r.image,
        role: r.role,
        joinedAt: r.joinedAt.toISOString(),
        isYou: r.userId === actor.userId,
      }))
      // Owner first, then by join date — the order people expect to read it in.
      .sort((a, b) =>
        a.role === "OWNER" ? -1 : b.role === "OWNER" ? 1 : a.joinedAt.localeCompare(b.joinedAt),
      ),
  };
}

export async function create(
  actor: ActorContext,
  name: string,
  db: Db = rootDb,
): Promise<HouseholdDTO> {
  if (actor.householdId) {
    throw new ForbiddenError("You are already in a household.");
  }

  const [household] = await db
    .insert(households)
    .values({
      name: name.trim() || "Household",
      ownerId: actor.userId,
      baseCurrency: actor.baseCurrency,
    })
    .returning();

  await db.insert(householdMembers).values({
    householdId: household!.id,
    userId: actor.userId,
    role: "OWNER",
  });

  await audit.record(
    actor,
    {
      action: "household.create",
      entityType: "Household",
      entityId: household!.id,
      after: household,
    },
    db,
  );

  const created = await get({ ...actor, householdId: household!.id }, db);
  return created!;
}

export async function leave(actor: ActorContext, db: Db = rootDb): Promise<void> {
  if (!actor.householdId) throw new ForbiddenError("You are not in a household.");
  if (actor.householdRole === "OWNER") {
    // Letting the owner walk out would leave members with a household nobody
    // can administer. Transferring ownership has to come first.
    throw new ForbiddenError("Transfer ownership before leaving the household.");
  }

  await db
    .update(householdMembers)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(householdMembers.householdId, actor.householdId),
        eq(householdMembers.userId, actor.userId),
        isNull(householdMembers.removedAt),
      ),
    );

  await audit.record(
    actor,
    { action: "household.leave", entityType: "Household", entityId: actor.householdId },
    db,
  );
}
