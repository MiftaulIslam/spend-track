import { and, eq } from "drizzle-orm";
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import { db as rootDb, type Db } from "@/src/server/db";
import { authAccounts, sessions, users, verificationTokens } from "@/src/server/db/schema";

/**
 * Auth.js adapter, written against Drizzle directly.
 *
 * `@auth/drizzle-adapter` assumes its own table names and column set; this
 * schema differs in two ways that matter. OAuth links live in `AuthAccount`,
 * because `Account` here is a *financial* account — the most-referenced model in
 * the product — and `Session` carries device, IP hash and a `revokedAt` column
 * so Settings can show a session list and revoke one.
 *
 * Writing the six methods out is less code than bending a library around both,
 * and it keeps the revocation check somewhere a reader will find it.
 */

function toAdapterUser(row: typeof users.$inferSelect): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    image: row.image,
  };
}

export function authAdapter(db: Db = rootDb): Adapter {
  return {
    async createUser(user) {
      const [row] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          image: user.image,
        })
        .returning();
      return toAdapterUser(row!);
    },

    async getUser(id) {
      const row = await db.query.users.findFirst({ where: eq(users.id, id) });
      return row ? toAdapterUser(row) : null;
    },

    async getUserByEmail(email) {
      const row = await db.query.users.findFirst({ where: eq(users.email, email) });
      return row ? toAdapterUser(row) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const row = await db
        .select({ user: users })
        .from(authAccounts)
        .innerJoin(users, eq(users.id, authAccounts.userId))
        .where(
          and(
            eq(authAccounts.provider, provider),
            eq(authAccounts.providerAccountId, providerAccountId),
          ),
        )
        .limit(1);
      return row[0] ? toAdapterUser(row[0].user) : null;
    },

    async updateUser(user) {
      const [row] = await db
        .update(users)
        .set({
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          image: user.image,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      return toAdapterUser(row!);
    },

    async deleteUser(userId) {
      await db.delete(users).where(eq(users.id, userId));
    },

    async linkAccount(account) {
      await db.insert(authAccounts).values({
        id: crypto.randomUUID(),
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refreshToken: account.refresh_token ?? null,
        accessToken: account.access_token ?? null,
        expiresAt: account.expires_at ?? null,
        tokenType: account.token_type ?? null,
        scope: account.scope ?? null,
        idToken: account.id_token ?? null,
        sessionState: account.session_state ? String(account.session_state) : null,
      });
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await db
        .delete(authAccounts)
        .where(
          and(
            eq(authAccounts.provider, provider),
            eq(authAccounts.providerAccountId, providerAccountId),
          ),
        );
    },

    /**
     * Device and coarse location are captured at sign-in so Settings can show a
     * session list worth reading. Auth.js does not pass the request here, so
     * those columns are filled in on the first authenticated request.
     */
    async createSession(session): Promise<AdapterSession> {
      const [row] = await db
        .insert(sessions)
        .values({
          id: crypto.randomUUID(),
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        })
        .returning();
      return {
        sessionToken: row!.sessionToken,
        userId: row!.userId,
        expires: row!.expires,
      };
    },

    /** A revoked session must stop working immediately, not at expiry. */
    async getSessionAndUser(sessionToken) {
      const rows = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.sessionToken, sessionToken))
        .limit(1);

      const row = rows[0];
      if (!row || row.session.revokedAt) return null;
      if (row.user.deletedAt || row.user.status !== "ACTIVE") return null;

      return {
        session: {
          sessionToken: row.session.sessionToken,
          userId: row.session.userId,
          expires: row.session.expires,
        },
        user: toAdapterUser(row.user),
      };
    },

    async updateSession(session) {
      const [row] = await db
        .update(sessions)
        .set({ expires: session.expires, lastSeenAt: new Date() })
        .where(eq(sessions.sessionToken, session.sessionToken))
        .returning();
      if (!row) return null;
      return { sessionToken: row.sessionToken, userId: row.userId, expires: row.expires };
    },

    async deleteSession(sessionToken) {
      await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
    },

    async createVerificationToken(token) {
      const [row] = await db.insert(verificationTokens).values(token).returning();
      return row ?? null;
    },

    async useVerificationToken({ identifier, token }) {
      const [row] = await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, token),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}
