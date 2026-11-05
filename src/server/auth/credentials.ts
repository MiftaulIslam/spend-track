"use server";

import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/src/server/db";
import { loginAttempts, sessions, users } from "@/src/server/db/schema";
import { hashIp } from "@/src/lib/hash";
import { consume } from "@/src/lib/rate-limit";
import { seedDefaultsForUser } from "@/src/server/services/onboarding-service";
import * as notifications from "@/src/server/services/notification-service";
import { recordSystemEvent } from "@/src/server/services/audit-service";

/**
 * Email + password sign-in, done by hand.
 *
 * Auth.js's Credentials provider cannot create a **database** session — there
 * is no OAuth account to link, so the library short-circuits to a JWT. The
 * product promises a session list you can revoke from Settings, and a JWT
 * cannot be revoked server-side.
 *
 * So this writes the `Session` row itself, using the same table and the same
 * cookie name Auth.js uses. `auth()`, the adapter and `signOut()` all keep
 * working unchanged; the only thing added is the one step the library declines
 * to take. It also lets us record the device and IP at sign-in, which the
 * adapter has no hook for.
 */

const SESSION_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Matches Auth.js's own naming so its reader finds the cookie. */
function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export interface PasswordSignInResult {
  ok: boolean;
  /** Deliberately generic — never reveals which field was wrong. */
  error?: string;
  retryAfterSeconds?: number;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  const normalised = email.trim().toLowerCase();
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  const ipHash = hashIp(ip);
  const userAgent = headerList.get("user-agent") ?? undefined;

  // Two limiters: one per IP to stop spraying, one per account to stop a
  // targeted attack on one user without letting an attacker lock out everyone.
  const byIp = await consume(`signin:ip:${ipHash}`, { limit: 20, windowSeconds: 300 });
  if (!byIp.allowed) {
    await recordSystemEvent({
      kind: "RATE_LIMIT",
      severity: "WARNING",
      source: "signin",
      message: "Sign-in rate limit reached for an IP",
      fingerprint: "signin:ip-rate-limit",
    });
    return { ok: false, error: "Too many attempts. Try again shortly.", retryAfterSeconds: byIp.retryAfterSeconds };
  }

  if (!normalised || !password) {
    return { ok: false, error: "Enter your email and password." };
  }

  const lockedOut = await isLockedOut(normalised);
  if (lockedOut) {
    await record(normalised, null, false, "locked_out", ipHash);
    return {
      ok: false,
      error: "Too many failed attempts. Try again in 15 minutes.",
      retryAfterSeconds: 900,
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, normalised),
    columns: { id: true, passwordHash: true, status: true, deletedAt: true, name: true },
  });

  // A missing account must not answer faster than a wrong password, or the
  // response time tells an attacker which emails are registered.
  if (!user?.passwordHash || user.deletedAt || user.status !== "ACTIVE") {
    await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    await record(normalised, user?.id ?? null, false, user ? "inactive" : "no_such_user", ipHash);
    return { ok: false, error: "That email and password don't match." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  await record(normalised, user.id, valid, valid ? null : "bad_password", ipHash);
  if (!valid) {
    return { ok: false, error: "That email and password don't match." };
  }

  // A new device is worth telling the user about before we create the session.
  const seenBefore = await db.query.sessions.findFirst({
    where: and(eq(sessions.userId, user.id), eq(sessions.ipHash, ipHash)),
    columns: { id: true },
  });

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({
    sessionToken,
    userId: user.id,
    expires,
    userAgent,
    ipHash,
    location: describeDevice(userAgent),
  });

  const store = await cookies();
  store.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });

  // Defensive: a user created outside the Auth.js createUser event (a seed, an
  // import) may have no settings row yet.
  await seedDefaultsForUser(user.id).catch(() => undefined);

  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

  if (!seenBefore) {
    await notifications
      .notify({
        userId: user.id,
        kind: "NEW_SIGN_IN",
        severity: "INFO",
        title: "New sign-in",
        body: `${describeDevice(userAgent) ?? "A new device"} signed in to your account.`,
        dedupeKey: `signin:${user.id}:${ipHash}`,
      })
      .catch(() => undefined);
  }

  return { ok: true };
}

/** Sign out this device, revoking the row so the token stops working at once. */
export async function signOutCurrentSession(): Promise<void> {
  const store = await cookies();
  const name = sessionCookieName();
  const token = store.get(name)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.sessionToken, token))
      .catch(() => undefined);
  }
  store.delete(name);
}

async function record(
  email: string,
  userId: string | null,
  success: boolean,
  reason: string | null,
  ipHash: string,
): Promise<void> {
  await db
    .insert(loginAttempts)
    .values({ email, userId, success, reason, ipHash })
    .catch(() => undefined);
}

async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since),
      ),
    );
  return (row?.n ?? 0) >= MAX_FAILED_ATTEMPTS;
}

/** A readable device label for the session list. No fingerprinting. */
function describeDevice(userAgent?: string): string | undefined {
  if (!userAgent) return undefined;
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Browser";

  const platform =
    /iPhone/.test(userAgent) ? "iPhone"
    : /iPad/.test(userAgent) ? "iPad"
    : /Android/.test(userAgent) ? "Android"
    : /Windows NT/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "Unknown device";

  return `${browser} on ${platform}`;
}

export async function setPassword(userId: string, plain: string): Promise<void> {
  const passwordHash = await bcrypt.hash(plain, 12);
  await db
    .update(users)
    .set({ passwordHash, passwordSetAt: new Date() })
    .where(eq(users.id, userId));
}
