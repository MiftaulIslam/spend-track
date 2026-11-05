import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db as rootDb } from "@/src/server/db";
import {
  bills,
  householdInvites,
  loginAttempts,
  recurringTransactions,
  reportJobs,
  sessions,
  systemEvents,
  transactions,
  userSettings,
  users,
} from "@/src/server/db/schema";
import { loadActor, systemActor } from "@/src/server/auth/guards";
import { recordSystemEvent } from "@/src/server/services/audit-service";
import * as recurringService from "@/src/server/services/recurring-service";
import * as billService from "@/src/server/services/bill-service";
import * as savingsTargetService from "@/src/server/services/savings-target-service";
import * as budgetService from "@/src/server/services/budget-service";
import * as subscriptionService from "@/src/server/services/subscription-service";
import * as analyticsService from "@/src/server/services/analytics-service";
import * as notifications from "@/src/server/services/notification-service";
import * as fxService from "@/src/server/services/fx-service";
import * as features from "@/src/server/ai/features";
import { aiConfigured } from "@/src/server/ai/client";
import { sweepExpired } from "@/src/lib/rate-limit";
import { money, toDTO } from "@/src/domain/money";

/**
 * Background jobs.
 *
 * Every job is **idempotent**. Running one twice, or running it again after a
 * crash halfway through, must not double-post rent or send the same reminder
 * twice — which is enforced by unique indexes (`(recurringId, dueOn)`,
 * `(userId, dedupeKey)`) rather than by the job remembering where it got to.
 *
 * Each job returns a summary and records a `SystemEvent`, which is what the
 * admin System page reads.
 */

export interface JobResult {
  job: string;
  ok: boolean;
  durationMs: number;
  summary: Record<string, unknown>;
  error?: string;
}

async function run(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<JobResult> {
  const started = Date.now();
  try {
    const summary = await fn();
    const durationMs = Date.now() - started;
    await recordSystemEvent({
      kind: "JOB_RUN",
      severity: "INFO",
      source: name,
      message: "Completed",
      fingerprint: `${name}:ok`,
      metadata: summary,
      durationMs,
    });
    return { job: name, ok: true, durationMs, summary };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    await recordSystemEvent({
      kind: "JOB_RUN",
      severity: "ERROR",
      source: name,
      message,
      fingerprint: `${name}:error`,
      durationMs,
    });
    return { job: name, ok: false, durationMs, summary: {}, error: message };
  }
}

/** Users with anything worth processing. Avoids iterating deleted accounts. */
async function activeUserIds(): Promise<string[]> {
  const rows = await rootDb
    .select({ id: users.id })
    .from(users)
    .where(and(isNull(users.deletedAt), eq(users.status, "ACTIVE")));
  return rows.map((r) => r.id);
}

/* ═════════════════════════════════════════════════ recurring-materialise ══ */

export const recurringMaterialise = (): Promise<JobResult> =>
  run("recurring-materialise", async () => {
    const result = await recurringService.materialiseDue();

    // Tell the user about anything that was created, once per occurrence.
    for (const detail of result.details) {
      if (!detail.transactionId) continue;
      const schedule = await rootDb.query.recurringTransactions.findFirst({
        where: eq(recurringTransactions.id, detail.recurringId),
        columns: { userId: true, name: true, currency: true, amountMinor: true },
      });
      if (!schedule) continue;

      await notifications.notify({
        userId: schedule.userId,
        kind: "RECURRING_CREATED",
        title: `${schedule.name} is due`,
        body: schedule.amountMinor
          ? `${toDTO(money(schedule.amountMinor, schedule.currency)).decimal} ${schedule.currency} — pending until it posts.`
          : "Created as a pending transaction.",
        data: { transactionId: detail.transactionId, recurringId: detail.recurringId },
        dedupeKey: `recurring:${detail.recurringId}:${detail.dueOn.slice(0, 10)}`,
      });
    }

    return {
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
      // Non-zero means the scheduler was down past the catch-up window.
      outsideWindow: result.outsideWindow,
    };
  });

/* ═══════════════════════════════════════════════════════ bill-reminders ══ */

export const billReminders = (): Promise<JobResult> =>
  run("bill-reminders", async () => {
    const flipped = await billService.markOverdue();
    const due = await billService.dueForReminder();

    let sent = 0;
    for (const bill of due) {
      const created = await notifications.notify({
        userId: bill.userId,
        kind: bill.overdue ? "BILL_OVERDUE" : "BILL_DUE",
        severity: bill.overdue ? "CRITICAL" : "WARNING",
        title: bill.overdue ? `${bill.billName} is overdue` : `${bill.billName} is due soon`,
        body: `${toDTO(money(bill.expectedMinor, bill.currency)).decimal} ${bill.currency} · due ${bill.dueOn.toISOString().slice(0, 10)}`,
        data: { occurrenceId: bill.occurrenceId, billName: bill.billName },
        dedupeKey: bill.dedupeKey,
      });
      if (created) sent++;
    }

    // Keep the occurrence horizon topped up so the calendar never runs dry.
    let generated = 0;
    for (const userId of await activeUserIds()) {
      const actor = await loadActor(userId, "SYSTEM");
      if (!actor) continue;
      const activeBills = await rootDb
        .select({ id: bills.id })
        .from(bills)
        .where(
          and(eq(bills.userId, userId), isNull(bills.deletedAt), eq(bills.status, "ACTIVE")),
        );
      for (const bill of activeBills) {
        generated += await billService.generateOccurrences(actor, bill.id, 6);
      }
    }

    return { markedOverdue: flipped, remindersSent: sent, occurrencesGenerated: generated };
  });

/* ═══════════════════════════════════════════════════════ budget-alerts ══ */

export const budgetAlerts = (): Promise<JobResult> =>
  run("budget-alerts", async () => {
    let sent = 0;
    let rolled = 0;

    for (const userId of await activeUserIds()) {
      const actor = await loadActor(userId, "SYSTEM");
      if (!actor) continue;

      const rollover = await budgetService.rolloverPeriods(actor);
      rolled += rollover.updated;

      for (const alert of await budgetService.pendingAlerts(actor)) {
        const exceeded = alert.threshold >= 100;
        const created = await notifications.notify({
          userId,
          kind: exceeded ? "BUDGET_EXCEEDED" : "BUDGET_THRESHOLD",
          severity: exceeded ? "WARNING" : "INFO",
          title: exceeded
            ? `${alert.categoryName} is over budget`
            : `${alert.categoryName} is at ${alert.threshold}%`,
          body: `${alert.spent.decimal} of ${alert.limit.decimal} spent in ${alert.budgetName}.`,
          data: { budgetId: alert.budgetId, categoryId: alert.categoryId },
          dedupeKey: alert.dedupeKey,
        });
        if (created) sent++;
      }
    }

    return { alertsSent: sent, rolloverLinesUpdated: rolled };
  });

/* ════════════════════════════════════════════════════ subscription-watch ══ */

export const subscriptionWatch = (): Promise<JobResult> =>
  run("subscription-watch", async () => {
    let sent = 0;
    let usageRefreshed = 0;

    for (const userId of await activeUserIds()) {
      const actor = await loadActor(userId, "SYSTEM");
      if (!actor) continue;
      usageRefreshed += await subscriptionService.refreshUsage(actor);
    }

    for (const alert of await subscriptionService.dueForAlert()) {
      const created = await notifications.notify({
        userId: alert.userId,
        kind: alert.kind === "TRIAL_ENDING" ? "TRIAL_ENDING" : "SUBSCRIPTION_RENEWAL",
        severity: alert.kind === "TRIAL_ENDING" ? "WARNING" : "INFO",
        title:
          alert.kind === "TRIAL_ENDING"
            ? `${alert.name} trial ends ${alert.daysUntil === 0 ? "today" : `in ${alert.daysUntil} days`}`
            : `${alert.name} renews ${alert.daysUntil === 0 ? "today" : `in ${alert.daysUntil} days`}`,
        body: `${toDTO(money(alert.priceMinor, alert.currency)).decimal} ${alert.currency}`,
        data: { subscriptionId: alert.subscriptionId },
        dedupeKey: alert.dedupeKey,
      });
      if (created) sent++;
    }

    return { alertsSent: sent, usageRefreshed };
  });

/* ═════════════════════════════════════════════════════════ anomaly-scan ══ */

export const anomalyScan = (): Promise<JobResult> =>
  run("anomaly-scan", async () => {
    let sent = 0;

    for (const userId of await activeUserIds()) {
      const actor = await loadActor(userId, "SYSTEM");
      if (!actor) continue;

      // Statistical detection, not AI: far above this merchant's own median.
      const anomalies = await analyticsService.detectAnomalies(actor, { sinceDays: 2 });
      for (const anomaly of anomalies.slice(0, 3)) {
        const created = await notifications.notify({
          userId,
          kind: "UNUSUAL_TRANSACTION",
          severity: "WARNING",
          title: "Unusual charge detected",
          body: `${anomaly.amount.decimal} at ${anomaly.description} — ${anomaly.reason.toLowerCase()}`,
          data: { transactionId: anomaly.transactionId },
          dedupeKey: anomaly.dedupeKey,
        });
        if (created) sent++;
      }
    }

    return { alertsSent: sent };
  });

/* ═══════════════════════════════════════════════════════════ low-balance ══ */

export const lowBalanceWatch = (): Promise<JobResult> =>
  run("low-balance-watch", async () => {
    let sent = 0;
    for (const alert of await notifications.lowBalanceAlerts()) {
      const created = await notifications.notify({
        userId: alert.userId,
        kind: "LOW_BALANCE",
        severity: "WARNING",
        title: `${alert.accountName} is running low`,
        body: `Balance is ${toDTO(money(alert.balanceMinor, alert.currency)).decimal} ${alert.currency}.`,
        data: { accountId: alert.accountId },
        dedupeKey: alert.dedupeKey,
      });
      if (created) sent++;
    }
    return { alertsSent: sent };
  });

/* ═══════════════════════════════════════════════════ exchange-rate-sync ══ */

export const exchangeRateSync = (): Promise<JobResult> =>
  run("exchange-rate-sync", async () => {
    const result = await fxService.syncRates();
    return { inserted: result.inserted, asOf: result.asOf.toISOString().slice(0, 10) };
  });

/* ═══════════════════════════════════════════════════════════ weekly-brief ══ */

export const weeklyBrief = (): Promise<JobResult> =>
  run("weekly-brief", async () => {
    if (!aiConfigured()) return { skipped: "ANTHROPIC_API_KEY is not set" };

    let generated = 0;
    let skipped = 0;
    const weekKey = isoWeek(new Date());

    for (const userId of await activeUserIds()) {
      const settings = await rootDb.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
        columns: { aiEnabled: true },
      });
      if (settings && !settings.aiEnabled) {
        skipped++;
        continue;
      }

      // Not worth a model call for an account with no activity.
      const [recentRow] = await rootDb
        .select({ n: count() })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
            gte(transactions.occurredAt, new Date(Date.now() - 30 * 86_400_000)),
          ),
        );
      const recent = recentRow?.n ?? 0;
      if (recent < 5) {
        skipped++;
        continue;
      }

      const actor = await loadActor(userId, "SYSTEM");
      if (!actor) continue;

      try {
        const brief = await features.generateBrief(actor);
        if (!brief) {
          skipped++;
          continue;
        }
        const created = await notifications.notify({
          userId,
          kind: "WEEKLY_BRIEF",
          title: brief.headline,
          body: brief.body,
          data: { suggestions: brief.suggestions },
          dedupeKey: `weekly-brief:${userId}:${weekKey}`,
        });
        if (created) generated++;
      } catch {
        // The assistant being unavailable must never fail the whole job run.
        skipped++;
      }
    }

    return { generated, skipped };
  });

/* ═════════════════════════════════════════════════════ auto-categorise ══ */

export const autoCategorise = (): Promise<JobResult> =>
  run("auto-categorise", async () => {
    if (!aiConfigured()) return { skipped: "ANTHROPIC_API_KEY is not set" };

    let applied = 0;
    let flagged = 0;

    for (const userId of await activeUserIds()) {
      const settings = await rootDb.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
        columns: { aiEnabled: true, aiAutoCategorise: true },
      });
      if (!settings?.aiEnabled || !settings.aiAutoCategorise) continue;

      const pending = await rootDb
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.categoryId),
            isNull(transactions.deletedAt),
          ),
        )
        .orderBy(desc(transactions.occurredAt))
        .limit(40);
      if (pending.length === 0) continue;

      const actor = await loadActor(userId, "SYSTEM");
      if (!actor) continue;

      try {
        const results = await features.categoriseTransactions(actor, pending.map((p) => p.id));
        const outcome = await features.applyCategorisations(actor, results, { autoApplyAbove: 0.85 });
        applied += outcome.applied;
        flagged += outcome.flagged;
      } catch {
        // Leave them uncategorised; the review queue still shows them.
      }
    }

    return { applied, flagged };
  });

/* ═══════════════════════════════════════════════════════ retention-sweep ══ */

export const retentionSweep = (): Promise<JobResult> =>
  run("retention-sweep", async () => {
    const now = Date.now();

    // Soft-deleted records become permanent after 30 days — the window the
    // product promises for undo.
    const purgedTransactions = {
      count: (
        await rootDb
          .delete(transactions)
          .where(lt(transactions.deletedAt, new Date(now - 30 * 86_400_000)))
          .returning({ id: transactions.id })
      ).length,
    };

    const expiredSessions = {
      count: (
        await rootDb
          .delete(sessions)
          .where(lt(sessions.expires, new Date(now - 7 * 86_400_000)))
          .returning({ id: sessions.id })
      ).length,
    };

    const expiredReports = {
      count: (
        await rootDb
          .delete(reportJobs)
          .where(lt(reportJobs.createdAt, new Date(now - 90 * 86_400_000)))
          .returning({ id: reportJobs.id })
      ).length,
    };

    const oldAttempts = {
      count: (
        await rootDb
          .delete(loginAttempts)
          .where(lt(loginAttempts.createdAt, new Date(now - 90 * 86_400_000)))
          .returning({ id: loginAttempts.id })
      ).length,
    };

    // Security events are kept for 2 years; job telemetry for 30 days.
    const oldEvents = {
      count: (
        await rootDb
          .delete(systemEvents)
          .where(
            and(
              lt(systemEvents.createdAt, new Date(now - 30 * 86_400_000)),
              inArray(systemEvents.kind, ["JOB_RUN", "RATE_LIMIT"]),
            ),
          )
          .returning({ id: systemEvents.id })
      ).length,
    };

    const expiredInvites = {
      count: (
        await rootDb
          .delete(householdInvites)
          .where(
            and(
              isNull(householdInvites.acceptedAt),
              lt(householdInvites.expiresAt, new Date(now - 30 * 86_400_000)),
            ),
          )
          .returning({ id: householdInvites.id })
      ).length,
    };

    const rateLimits = await sweepExpired();

    const dueForPurge = await rootDb
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.deletedAt), lt(users.purgeAfter, new Date())));
    for (const user of dueForPurge) {
      // Cascades handle the rest of the graph.
      await rootDb
        .delete(users)
        .where(eq(users.id, user.id))
        .catch(() => undefined);
    }

    return {
      purgedTransactions: purgedTransactions.count,
      expiredSessions: expiredSessions.count,
      expiredReports: expiredReports.count,
      oldAttempts: oldAttempts.count,
      oldEvents: oldEvents.count,
      expiredInvites: expiredInvites.count,
      rateLimitRows: rateLimits,
      purgedUsers: dueForPurge.length,
    };
  });

/* --------------------------------------------------------------- registry */

/* ══════════════════════════════════════════════════ savings-reminders ══ */

/**
 * Nudge a savings target whose deposit has slipped.
 *
 * Only fires once a target is genuinely past its own interval — a quarterly
 * plan is not chased monthly — and the body names the amount, so the reminder
 * is actionable rather than a prompt to go and look something up.
 */
export const savingsReminders = (): Promise<JobResult> =>
  run("savings-reminders", async () => {
    const due = await savingsTargetService.dueForDeposit();
    let sent = 0;

    for (const target of due) {
      const created = await notifications.notify({
        userId: target.userId,
        kind: "GOAL_MILESTONE",
        severity: "INFO",
        title: `${target.name} is waiting on a deposit`,
        body: `${toDTO(money(target.amountMinor, target.currency)).decimal} ${
          target.currency
        } — ${target.daysOverdue} ${target.daysOverdue === 1 ? "day" : "days"} past due.`,
        data: { goalId: target.goalId, kind: "savings-target" },
        dedupeKey: target.dedupeKey,
      });
      if (created) sent++;
    }

    return { targetsDue: due.length, remindersSent: sent };
  });

export const JOBS = {
  "recurring-materialise": recurringMaterialise,
  "bill-reminders": billReminders,
  "budget-alerts": budgetAlerts,
  "subscription-watch": subscriptionWatch,
  "anomaly-scan": anomalyScan,
  "low-balance-watch": lowBalanceWatch,
  "exchange-rate-sync": exchangeRateSync,
  "weekly-brief": weeklyBrief,
  "auto-categorise": autoCategorise,
  "savings-reminders": savingsReminders,
  "retention-sweep": retentionSweep,
} as const;

export type JobName = keyof typeof JOBS;

export const JOB_SCHEDULE: Record<JobName, string> = {
  "recurring-materialise": "every 15 minutes",
  "bill-reminders": "hourly",
  "budget-alerts": "every 30 minutes",
  "subscription-watch": "every 6 hours",
  "anomaly-scan": "hourly",
  "low-balance-watch": "every 6 hours",
  "exchange-rate-sync": "every 6 hours",
  "weekly-brief": "Mondays at 06:00",
  "auto-categorise": "every 30 minutes",
  "savings-reminders": "daily at 09:00",
  "retention-sweep": "daily at 03:00",
};

/**
 * ISO week key, used to dedupe the weekly brief.
 * Week-of-year is the natural key here; a date would let the job send twice if
 * it ran on a Monday and again on the Tuesday after a failure.
 */
function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current ISO week determines the year.
  const dayOfWeek = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export { isoWeek, systemActor };
