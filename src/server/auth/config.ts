import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/src/server/db";
import { adminUsers, userSettings, users } from "@/src/server/db/schema";
import { authAdapter } from "./adapter";
import { seedDefaultsForUser } from "@/src/server/services/onboarding-service";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      baseCurrency: string;
      locale: string;
    } & DefaultSession["user"];
  }
}

/**
 * Database sessions rather than JWTs.
 *
 * The product promises a session list you can revoke from Settings, and a JWT
 * cannot be revoked server-side — it is valid until it expires. Paying a query
 * per request is the cost of that promise being true.
 *
 * Auth.js's Credentials provider is deliberately **not** registered here: it
 * cannot create a database session, so registering it would give us a sign-in
 * path that appears to work and silently produces no revocable session. Email
 * and password sign-in lives in `./credentials.ts`, which writes the same
 * Session row and the same cookie by hand. See that file for why.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: authAdapter(db),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile: (profile) => ({
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
        emailVerified: profile.email_verified ? new Date() : null,
      }),
    }),

  ],

  callbacks: {
    async session({ session, user }) {
      const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, user.id),
        columns: { baseCurrency: true, locale: true },
      });
      const admin = await db.query.adminUsers.findFirst({
        where: and(eq(adminUsers.userId, user.id), isNull(adminUsers.revokedAt)),
        columns: { id: true },
      });

      session.user.id = user.id;
      session.user.isAdmin = Boolean(admin);
      session.user.baseCurrency = settings?.baseCurrency ?? "USD";
      session.user.locale = settings?.locale ?? "en-US";
      return session;
    },

    async signIn({ user }) {
      if (!user.id) return true;
      const existing = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { status: true, deletedAt: true },
      });
      // A suspended or deleted account must not be able to sign back in.
      if (existing && (existing.status !== "ACTIVE" || existing.deletedAt)) return false;
      return true;
    },
  },

  events: {
    /** A brand-new user has no categories, settings or accounts. Give them some. */
    async createUser({ user }) {
      if (user.id) await seedDefaultsForUser(user.id);
    },
    async signIn({ user, isNewUser }) {
      if (!user.id || isNewUser) return;
      await db
        .update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, user.id))
        .catch(() => undefined);
    },
  },
});

export const PASSWORD_COST = 12;
