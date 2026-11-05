import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./config";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/src/server/db";
import { adminUsers, householdMembers, users } from "@/src/server/db/schema";
import { ForbiddenError, UnauthorizedError } from "@/src/server/errors";

/**
 * Who is acting, and what they are allowed to see.
 *
 * Every service takes this as its first argument instead of a request, so the
 * same service is callable from a Route Handler, a Server Action, a background
 * job, an AI tool or a test with no adaptation.
 */
export interface ActorContext {
  userId: string;
  email: string;
  name: string | null;
  baseCurrency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
  monthStartsOn: number;
  householdId: string | null;
  householdRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | null;
  isAdmin: boolean;
  /** How this action was initiated — recorded on every audit row. */
  via: "USER" | "SYSTEM" | "RULE" | "AI" | "ADMIN" | "IMPORT";
}

/**
 * `cache` dedupes this across one render pass: a layout, three Server
 * Components and a Server Action in the same request share one query rather
 * than issuing four.
 */
export const getActor = cache(async (): Promise<ActorContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return loadActor(session.user.id);
});

export async function loadActor(
  userId: string,
  via: ActorContext["via"] = "USER",
): Promise<ActorContext | null> {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt), eq(users.status, "ACTIVE")),
    columns: { id: true, email: true, name: true },
    with: {
      userSettings: {
        columns: {
          baseCurrency: true,
          locale: true,
          timezone: true,
          weekStartsOn: true,
          monthStartsOn: true,
        },
        limit: 1,
      },
      adminUsers: { columns: { id: true, revokedAt: true }, limit: 1 },
      householdMembers: {
        where: isNull(householdMembers.removedAt),
        columns: { householdId: true, role: true },
        limit: 1,
      },
    },
  });
  if (!user) return null;

  const settings = user.userSettings[0];
  const adminUser = user.adminUsers[0];
  const membership = user.householdMembers[0];
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: settings?.baseCurrency ?? "USD",
    locale: settings?.locale ?? "en-US",
    timezone: settings?.timezone ?? "UTC",
    weekStartsOn: settings?.weekStartsOn ?? 1,
    monthStartsOn: settings?.monthStartsOn ?? 1,
    householdId: membership?.householdId ?? null,
    householdRole: membership?.role ?? null,
    isAdmin: Boolean(adminUser && !adminUser.revokedAt),
    via,
  };
}

/** For Route Handlers and Server Actions: throws, so the error mapper handles it. */
export async function requireActor(): Promise<ActorContext> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

/** For layouts and pages: redirects, which is the right UX for a navigation. */
export async function requireUserPage(returnTo?: string): Promise<ActorContext> {
  const actor = await getActor();
  if (!actor) {
    redirect(returnTo ? `/signin?next=${encodeURIComponent(returnTo)}` : "/signin");
  }
  return actor;
}

export interface AdminContext extends ActorContext {
  adminUserId: string;
  adminRole: "SUPER_ADMIN" | "OPERATIONS" | "SUPPORT" | "ANALYST" | "READ_ONLY";
  permissions: ReadonlySet<string>;
}

/**
 * Role → capability. Administration is capability-checked, never role-checked
 * at the call site, so adding a role does not mean auditing every `if`.
 */
const ROLE_PERMISSIONS: Record<AdminContext["adminRole"], string[]> = {
  SUPER_ADMIN: ["*"],
  OPERATIONS: [
    "admin.overview.read", "admin.users.read", "admin.users.suspend",
    "admin.system.read", "admin.jobs.run", "admin.flags.write",
    "admin.config.write", "admin.ai.read", "admin.audit.read",
  ],
  SUPPORT: [
    "admin.overview.read", "admin.users.read", "admin.users.suspend",
    "admin.ai.read", "admin.audit.read",
  ],
  ANALYST: ["admin.overview.read", "admin.users.read", "admin.ai.read"],
  READ_ONLY: ["admin.overview.read"],
};

export const getAdminActor = cache(async (): Promise<AdminContext | null> => {
  const actor = await getActor();
  if (!actor?.isAdmin) return null;

  const admin = await db.query.adminUsers.findFirst({
    where: and(eq(adminUsers.userId, actor.userId), isNull(adminUsers.revokedAt)),
    columns: { id: true, role: true, extraPermissions: true },
  });
  if (!admin) return null;

  const granted = new Set([...(ROLE_PERMISSIONS[admin.role] ?? []), ...(admin.extraPermissions ?? [])]);
  return {
    ...actor,
    via: "ADMIN",
    adminUserId: admin.id,
    adminRole: admin.role,
    permissions: granted,
  };
});

export async function requireAdminPage(): Promise<AdminContext> {
  const admin = await getAdminActor();
  if (!admin) redirect("/signin?next=%2Fadmin");
  return admin;
}

export async function requireAdmin(permission?: string): Promise<AdminContext> {
  const admin = await getAdminActor();
  if (!admin) throw new ForbiddenError("This area is restricted.");
  if (permission) assertPermission(admin, permission);
  return admin;
}

export function hasPermission(admin: AdminContext, permission: string): boolean {
  return admin.permissions.has("*") || admin.permissions.has(permission);
}

export function assertPermission(admin: AdminContext, permission: string): void {
  if (!hasPermission(admin, permission)) {
    throw new ForbiddenError("Your admin role doesn't include that action.");
  }
}

/* ------------------------------------------------------------- household ── */

const HOUSEHOLD_CAPABILITIES: Record<NonNullable<ActorContext["householdRole"]>, string[]> = {
  OWNER: ["*"],
  ADMIN: [
    "household.read", "txn.create", "txn.edit.any", "account.manage",
    "budget.manage", "goal.manage", "data.import", "data.export",
    "member.invite", "member.remove", "ai.mutate",
  ],
  MEMBER: ["household.read", "txn.create", "txn.edit.own", "ai.read"],
  VIEWER: ["household.read", "ai.read"],
};

export function householdCan(actor: ActorContext, capability: string): boolean {
  if (!actor.householdRole) return false;
  const caps = HOUSEHOLD_CAPABILITIES[actor.householdRole];
  return caps.includes("*") || caps.includes(capability);
}

/**
 * The set of user ids whose data this actor may read.
 *
 * Household members can see each other's *shared* records; the repository layer
 * combines this with a `visibility` filter. Returning a set rather than a
 * boolean keeps the check inside the WHERE clause instead of after the fetch.
 */
export async function readableUserIds(actor: ActorContext): Promise<string[]> {
  if (!actor.householdId) return [actor.userId];
  const members = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, actor.householdId),
        isNull(householdMembers.removedAt),
      ),
    );
  return members.map((m) => m.userId);
}

/** A system actor for jobs, imports and rules. Never derived from a request. */
export function systemActor(
  userId: string,
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    userId,
    email: "system@spendtrack",
    name: "System",
    baseCurrency: "USD",
    locale: "en-US",
    timezone: "UTC",
    weekStartsOn: 1,
    monthStartsOn: 1,
    householdId: null,
    householdRole: null,
    isAdmin: false,
    via: "SYSTEM",
    ...overrides,
  };
}
