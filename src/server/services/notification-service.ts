import { and, asc, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import {
  accounts,
  notificationPreferences,
  notifications,
  userSettings,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, databaseErrorCode } from "@/src/server/errors";

/**
 * Notifications.
 *
 * Every notification carries a `dedupeKey`, and the database has a unique index
 * on (userId, dedupeKey). That single constraint is what stops a job that runs
 * every 30 minutes from telling you 48 times a day that your dining budget is
 * over — the second insert simply does nothing.
 */

export type NotificationKind =
  | "BILL_DUE" | "BILL_OVERDUE" | "BUDGET_THRESHOLD" | "BUDGET_EXCEEDED"
  | "UNUSUAL_TRANSACTION" | "SUBSCRIPTION_RENEWAL" | "TRIAL_ENDING" | "LOW_BALANCE"
  | "GOAL_MILESTONE" | "GOAL_COMPLETED" | "RECURRING_CREATED" | "MONTHLY_SUMMARY"
  | "WEEKLY_BRIEF" | "NEW_SIGN_IN" | "IMPORT_COMPLETE" | "REPORT_READY"
  | "RECEIPT_PROCESSED" | "HOUSEHOLD_INVITE" | "SECURITY_ALERT";

export type Severity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

/** These reach the user regardless of quiet hours. */
const IGNORES_QUIET_HOURS = new Set<NotificationKind>([
  "BILL_OVERDUE",
  "SECURITY_ALERT",
  "NEW_SIGN_IN",
]);

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  severity?: Severity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey: string;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  href: string | null;
}

/**
 * Create a notification if the user wants it and it is not a duplicate.
 * Returns null when it was suppressed, so a caller can count what actually went
 * out rather than what it attempted.
 */
export async function notify(input: NotifyInput, db: Db = rootDb): Promise<{ id: string } | null> {
  const preference = await db.query.notificationPreferences.findFirst({
    where: and(
      eq(notificationPreferences.userId, input.userId),
      eq(notificationPreferences.kind, input.kind),
    ),
    columns: { inApp: true, push: true, email: true },
  });
  // No row means the user has never configured it; the in-app default is on.
  if (preference && !preference.inApp && !preference.push && !preference.email) return null;

  if (!IGNORES_QUIET_HOURS.has(input.kind) && (await inQuietHours(input.userId, db))) {
    return null;
  }

  try {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        kind: input.kind,
        severity: input.severity ?? "INFO",
        title: input.title,
        body: input.body,
        data: (input.data ?? null) as never,
        dedupeKey: input.dedupeKey,
      })
      .returning({ id: notifications.id });
    return row ?? null;
  } catch (error) {
    // Unique violation on (userId, dedupeKey) — already sent. Not an error.
    // The code has to be dug out of the cause chain: the driver error is
    // wrapped, so a top-level `error.code` check finds nothing and every
    // repeat notification becomes a failed job.
    if (databaseErrorCode(error) === "23505") return null;
    throw error;
  }
}

async function inQuietHours(userId: string, db: Db): Promise<boolean> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { quietHoursStart: true, quietHoursEnd: true, timezone: true },
  });
  if (!settings?.quietHoursStart || !settings.quietHoursEnd) return false;

  const now = new Date();
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const [h, m] = local.split(":").map(Number);
  const minutes = h * 60 + m;
  const toMinutes = (s: string) => {
    const [hh, mm] = s.split(":").map(Number);
    return hh * 60 + mm;
  };
  const start = toMinutes(settings.quietHoursStart);
  const end = toMinutes(settings.quietHoursEnd);

  // A window like 22:00–07:30 wraps midnight.
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function hrefFor(kind: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  switch (kind) {
    case "BILL_DUE":
    case "BILL_OVERDUE": return "/bills";
    case "BUDGET_THRESHOLD":
    case "BUDGET_EXCEEDED": return data.budgetId ? `/budgets/${data.budgetId}` : "/budgets";
    case "UNUSUAL_TRANSACTION": return data.transactionId ? `/transactions/${data.transactionId}` : "/transactions";
    case "SUBSCRIPTION_RENEWAL":
    case "TRIAL_ENDING": return "/subscriptions";
    case "GOAL_MILESTONE":
    case "GOAL_COMPLETED": return data.goalId ? `/goals/${data.goalId}` : "/goals";
    case "LOW_BALANCE": return data.accountId ? `/accounts/${data.accountId}` : "/accounts";
    case "IMPORT_COMPLETE": return "/import";
    case "REPORT_READY": return "/reports";
    case "RECEIPT_PROCESSED": return "/receipts";
    case "NEW_SIGN_IN":
    case "SECURITY_ALERT": return "/settings#security";
    case "WEEKLY_BRIEF":
    case "MONTHLY_SUMMARY": return "/";
    default: return null;
  }
}

export async function list(
  actor: ActorContext,
  options: { unreadOnly?: boolean; kinds?: NotificationKind[]; limit?: number; cursor?: string } = {},
): Promise<{ items: NotificationDTO[]; nextCursor: string | null; unreadCount: number }> {
  const limit = Math.min(options.limit ?? 30, 100);

  const anchor = options.cursor
    ? await rootDb.query.notifications.findFirst({
        where: and(eq(notifications.id, options.cursor), eq(notifications.userId, actor.userId)),
        columns: { createdAt: true, id: true },
      })
    : undefined;

  const [rows, unreadCount] = await Promise.all([
    rootDb.query.notifications.findMany({
      where: and(
        eq(notifications.userId, actor.userId),
        isNull(notifications.dismissedAt),
        options.unreadOnly ? isNull(notifications.readAt) : undefined,
        options.kinds?.length ? inArray(notifications.kind, options.kinds as never) : undefined,
        anchor
          ? sql`(${notifications.createdAt}, ${notifications.id}) < (${anchor.createdAt}, ${anchor.id})`
          : undefined,
      ),
      orderBy: [desc(notifications.createdAt), desc(notifications.id)],
      limit: limit + 1,
    }),
    rootDb
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, actor.userId),
          isNull(notifications.readAt),
          isNull(notifications.dismissedAt),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
  ]);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((n) => {
    const data = (n.data ?? null) as Record<string, unknown> | null;
    return {
      id: n.id,
      kind: n.kind,
      severity: n.severity,
      title: n.title,
      body: n.body,
      data,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      href: hrefFor(n.kind, data),
    };
  });

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    unreadCount,
  };
}

export async function markRead(actor: ActorContext, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await rootDb
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(notifications.id, ids),
        eq(notifications.userId, actor.userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

export async function markAllRead(actor: ActorContext): Promise<number> {
  const rows = await rootDb
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function dismiss(actor: ActorContext, id: string): Promise<void> {
  const rows = await rootDb
    .update(notifications)
    .set({ dismissedAt: new Date(), readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId)))
    .returning({ id: notifications.id });
  if (rows.length === 0) throw new NotFoundError("That notification");
}

export async function unreadCount(actor: ActorContext, db: Db = rootDb): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, actor.userId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
      ),
    );
  return rows[0]?.n ?? 0;
}

/* ---------------------------------------------------------- preferences */

export async function preferences(actor: ActorContext) {
  const rows = await rootDb.query.notificationPreferences.findMany({
    where: eq(notificationPreferences.userId, actor.userId),
    orderBy: [asc(notificationPreferences.kind)],
  });
  return rows.map((r) => ({ kind: r.kind, inApp: r.inApp, push: r.push, email: r.email }));
}

export async function setPreference(
  actor: ActorContext,
  kind: NotificationKind,
  channels: { inApp?: boolean; push?: boolean; email?: boolean },
) {
  const [row] = await rootDb
    .insert(notificationPreferences)
    .values({
      userId: actor.userId,
      kind,
      inApp: channels.inApp ?? true,
      push: channels.push ?? false,
      email: channels.email ?? false,
    })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.kind],
      set: channels,
    })
    .returning();
  return row!;
}

export async function setQuietHours(
  actor: ActorContext,
  start: string | null,
  end: string | null,
): Promise<void> {
  await rootDb
    .update(userSettings)
    .set({ quietHoursStart: start, quietHoursEnd: end })
    .where(eq(userSettings.userId, actor.userId));
}

/* ------------------------------------------------------------ low balance */

/**
 * Accounts whose balance has fallen below a threshold.
 * Uses a per-account floor derived from that account's own typical balance
 * rather than one global number, because $200 is nothing in one account and
 * alarming in another.
 */
export async function lowBalanceAlerts(
  db: Db = rootDb,
): Promise<Array<{ userId: string; accountId: string; accountName: string; balanceMinor: bigint; currency: string; dedupeKey: string }>> {
  const rows = await db
    .select({
      userId: accounts.userId,
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      balance: accounts.cachedBalanceMinor,
    })
    .from(accounts)
    .where(
      and(
        isNull(accounts.deletedAt),
        isNull(accounts.archivedAt),
        inArray(accounts.type, ["CHECKING", "SAVINGS", "CASH", "PREPAID", "DIGITAL_WALLET"]),
        lt(accounts.cachedBalanceMinor, 10_000n),
      ),
    );

  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    userId: r.userId,
    accountId: r.id,
    accountName: r.name,
    balanceMinor: r.balance,
    currency: r.currency,
    // One alert per account per day, not per job run.
    dedupeKey: `low-balance:${r.id}:${today}`,
  }));
}
