import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  accounts,
  recurringTransactions,
  subscriptions,
  transactions,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError } from "@/src/server/errors";
import * as audit from "./audit-service";
import { divRoundHalfAway, money, toDTO, type MoneyDTO } from "@/src/domain/money";
import { addDays, addMonthsClamped, startOfUtcDay } from "@/src/domain/schedule";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import { resolveMerchant } from "./merchant-service";
import * as z from "zod";
import type { createSubscriptionSchema, updateSubscriptionSchema } from "@/src/lib/schemas";

/**
 * Subscriptions.
 *
 * The number that matters is **normalised monthly cost** — a $204/year
 * newspaper and a $17/month one are the same commitment, and a list that shows
 * "204" next to "17" is actively misleading. Everything here is computed, never
 * entered.
 */

/** Months per billing cycle, for normalising to a monthly figure. */
const CYCLE_MONTHS: Record<string, number> = {
  WEEKLY: 12 / 52,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  CUSTOM: 1,
};

const UNUSED_AFTER_DAYS = 60;

export interface SubscriptionDTO {
  id: string;
  name: string;
  planName: string | null;
  price: MoneyDTO;
  currency: string;
  cycle: string;
  cycleCount: number;
  monthlyCost: MoneyDTO;
  annualCost: MoneyDTO;
  status: string;
  startedOn: string;
  trialEndsOn: string | null;
  renewsOn: string | null;
  cancelledOn: string | null;
  daysUntilRenewal: number | null;
  daysUntilTrialEnd: number | null;
  accountId: string;
  accountName: string;
  categoryName: string | null;
  merchantName: string | null;
  websiteUrl: string | null;
  cancelUrl: string | null;
  notes: string | null;
  lastUsedAt: string | null;
  unusedDays: number | null;
  /** True when nothing has been charged or used for 60+ days. */
  looksUnused: boolean;
}



/** price per cycle → per month, in exact integer minor units. */
export function monthlyCostMinor(priceMinor: bigint, cycle: string, cycleCount: number): bigint {
  const months = (CYCLE_MONTHS[cycle] ?? 1) * Math.max(1, cycleCount);
  // Scale by 1000 so a weekly cycle (12/52 months) does not lose precision.
  const scaled = BigInt(Math.round(months * 1000));
  return scaled === 0n ? priceMinor : divRoundHalfAway(priceMinor * 1000n, scaled);
}

function toDto(
  row: {
    id: string; name: string; planName: string | null; priceMinor: bigint; currency: string;
    cycle: string; cycleCount: number; status: string; startedOn: Date; trialEndsOn: Date | null;
    renewsOn: Date | null; cancelledOn: Date | null; accountId: string; websiteUrl: string | null;
    cancelUrl: string | null; notes: string | null; lastUsedAt: Date | null;
    account: { id: string; name: string }; category: { name: string } | null; merchant: { name: string } | null;
  },
  now: Date,
): SubscriptionDTO {
  const price = money(row.priceMinor, row.currency);
  const monthly = money(monthlyCostMinor(row.priceMinor, row.cycle, row.cycleCount), row.currency);
  const annual = money(monthly.minor * 12n, row.currency);

  const days = (d: Date | null) =>
    d ? Math.ceil((startOfUtcDay(d).getTime() - startOfUtcDay(now).getTime()) / 86_400_000) : null;

  const unusedDays = row.lastUsedAt
    ? Math.floor((now.getTime() - row.lastUsedAt.getTime()) / 86_400_000)
    : null;

  return {
    id: row.id,
    name: row.name,
    planName: row.planName,
    price: toDTO(price),
    currency: row.currency,
    cycle: row.cycle,
    cycleCount: row.cycleCount,
    monthlyCost: toDTO(monthly),
    annualCost: toDTO(annual),
    status: row.status,
    startedOn: row.startedOn.toISOString(),
    trialEndsOn: row.trialEndsOn?.toISOString() ?? null,
    renewsOn: row.renewsOn?.toISOString() ?? null,
    cancelledOn: row.cancelledOn?.toISOString() ?? null,
    daysUntilRenewal: days(row.renewsOn),
    daysUntilTrialEnd: days(row.trialEndsOn),
    accountId: row.accountId,
    accountName: row.account.name,
    categoryName: row.category?.name ?? null,
    merchantName: row.merchant?.name ?? null,
    websiteUrl: row.websiteUrl,
    cancelUrl: row.cancelUrl,
    notes: row.notes,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    unusedDays,
    looksUnused: row.status === "ACTIVE" && unusedDays !== null && unusedDays >= UNUSED_AFTER_DAYS,
  };
}

export async function list(
  actor: ActorContext,
  options: { includeCancelled?: boolean } = {},
  db: Db = rootDb,
): Promise<SubscriptionDTO[]> {
  const rows = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.userId, actor.userId),
      isNull(subscriptions.deletedAt),
      options.includeCancelled
        ? undefined
        : inArray(subscriptions.status, ["TRIAL", "ACTIVE", "PAUSED"]),
    ),
    orderBy: [asc(subscriptions.name)],
    with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
  });

  const now = new Date();
  return rows
    .map((r) => toDto(r, now))
    .sort((a, b) => Number(BigInt(b.annualCost.minor) - BigInt(a.annualCost.minor)));
}

export async function get(actor: ActorContext, id: string, db: Db = rootDb): Promise<SubscriptionDTO> {
  const row = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.id, id),
      eq(subscriptions.userId, actor.userId),
      isNull(subscriptions.deletedAt),
    ),
    with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
  });
  if (!row) throw new NotFoundError("That subscription");
  return toDto(row, new Date());
}

export async function create(actor: ActorContext, input: z.infer<typeof createSubscriptionSchema>): Promise<SubscriptionDTO> {
  return withTransaction(rootDb, async (tx) => {
    const account = await tx.query.accounts.findFirst({
      where: and(
        eq(accounts.id, input.accountId),
        eq(accounts.userId, actor.userId),
        isNull(accounts.deletedAt),
      ),
      columns: { id: true },
    });
    if (!account) throw new NotFoundError("That account");

    const merchantId =
      input.merchantId ?? (await resolveMerchant(actor, { merchantName: input.name, db: tx }));

    const priceMinor = parseAmountForCurrency(input.price, input.currency, actor.locale);
    const renewsOn = input.renewsOn ?? nextRenewal(input.startedOn, input.cycle, input.cycleCount);

    let recurringId: string | null = null;
    if (input.createRecurring) {
      const [recurring] = await tx
        .insert(recurringTransactions)
        .values({
          userId: actor.userId,
          name: input.name,
          type: "EXPENSE",
          accountId: input.accountId,
          categoryId: input.categoryId,
          amountMode: "FIXED",
          amountMinor: priceMinor,
          currency: input.currency,
          frequency: frequencyForCycle(input.cycle),
          interval: input.cycle === "SEMIANNUAL" ? 6 : input.cycleCount,
          byMonthDay: input.startedOn.getUTCDate(),
          startsOn: input.startedOn,
          autoCreate: true,
          reminder: true,
          reminderDaysBefore: 2,
        })
        .returning({ id: recurringTransactions.id });
      if (!recurring) throw new NotFoundError("That subscription");
      recurringId = recurring.id;
    }

    const [inserted] = await tx
      .insert(subscriptions)
      .values({
        userId: actor.userId,
        name: input.name,
        merchantId,
        categoryId: input.categoryId,
        accountId: input.accountId,
        recurringId,
        planName: input.planName,
        priceMinor,
        currency: input.currency,
        cycle: input.cycle,
        cycleCount: input.cycleCount,
        startedOn: input.startedOn,
        trialEndsOn: input.trialEndsOn,
        renewsOn,
        status: input.trialEndsOn ? "TRIAL" : "ACTIVE",
        websiteUrl: input.websiteUrl || null,
        cancelUrl: input.cancelUrl || null,
        notes: input.notes,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That subscription");

    const row = (await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.id, inserted.id),
      with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
    }))!;

    await audit.record(
      actor,
      { action: "subscription.create", entityType: "Subscription", entityId: row.id, after: { name: row.name, priceMinor, cycle: row.cycle } },
      tx,
    );
    return toDto(row, new Date());
  });
}

export async function update(
  actor: ActorContext,
  id: string,
  input: z.infer<typeof updateSubscriptionSchema>,
): Promise<SubscriptionDTO> {
  const before = await rootDb.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.id, id),
      eq(subscriptions.userId, actor.userId),
      isNull(subscriptions.deletedAt),
    ),
    with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
  });
  if (!before) throw new NotFoundError("That subscription");

  await rootDb
    .update(subscriptions)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.planName !== undefined ? { planName: input.planName } : {}),
      ...(input.price !== undefined
        ? { priceMinor: parseAmountForCurrency(input.price, before.currency, actor.locale) }
        : {}),
      ...(input.cycle !== undefined ? { cycle: input.cycle } : {}),
      ...(input.cycleCount !== undefined ? { cycleCount: input.cycleCount } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.trialEndsOn !== undefined ? { trialEndsOn: input.trialEndsOn } : {}),
      ...(input.renewsOn !== undefined ? { renewsOn: input.renewsOn } : {}),
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl || null } : {}),
      ...(input.cancelUrl !== undefined ? { cancelUrl: input.cancelUrl || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.cancelledOn !== undefined ? { cancelledOn: input.cancelledOn } : {}),
    })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, actor.userId)));

  const after = (await rootDb.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
    with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
  }))!;

  await audit.record(actor, {
    action: "subscription.update",
    entityType: "Subscription",
    entityId: id,
    before: { name: before.name, priceMinor: before.priceMinor, status: before.status },
    after: { name: after.name, priceMinor: after.priceMinor, status: after.status },
  });
  return toDto(after, new Date());
}

/** Cancelling also stops the schedule, so no phantom charges keep appearing. */
export async function cancel(actor: ActorContext, id: string, cancelledOn = new Date()): Promise<SubscriptionDTO> {
  return withTransaction(rootDb, async (tx) => {
    const before = await tx.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.id, id),
        eq(subscriptions.userId, actor.userId),
        isNull(subscriptions.deletedAt),
      ),
      with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
    });
    if (!before) throw new NotFoundError("That subscription");

    await tx
      .update(subscriptions)
      .set({ status: "CANCELLED", cancelledOn })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, actor.userId)));

    const after = (await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.id, id),
      with: {
      account: { columns: { id: true, name: true } },
      category: { columns: { name: true } },
      merchant: { columns: { name: true } },
    },
    }))!;

    if (before.recurringId) {
      await tx
        .update(recurringTransactions)
        .set({ status: "ENDED", endsOn: cancelledOn })
        .where(
          and(
            eq(recurringTransactions.id, before.recurringId),
            eq(recurringTransactions.userId, actor.userId),
          ),
        );
    }

    await audit.record(
      actor,
      {
        action: "subscription.cancel",
        entityType: "Subscription",
        entityId: id,
        before: { status: before.status },
        after: { status: "CANCELLED", cancelledOn },
      },
      tx,
    );
    return toDto(after, new Date());
  });
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.id, id),
      eq(subscriptions.userId, actor.userId),
      isNull(subscriptions.deletedAt),
    ),
  });
  if (!before) throw new NotFoundError("That subscription");
  await rootDb
    .update(subscriptions)
    .set({ deletedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, actor.userId)));
  await audit.record(actor, { action: "subscription.delete", entityType: "Subscription", entityId: id, before });
}

export interface SubscriptionSummary {
  monthlyTotal: MoneyDTO;
  annualTotal: MoneyDTO;
  activeCount: number;
  trialCount: number;
  unusedCount: number;
  unusedAnnualCost: MoneyDTO;
  trialsEndingSoon: SubscriptionDTO[];
  renewingSoon: SubscriptionDTO[];
  unused: SubscriptionDTO[];
}

export async function summary(actor: ActorContext, db: Db = rootDb): Promise<SubscriptionSummary> {
  const subs = await list(actor, {}, db);
  const currency = actor.baseCurrency;

  let monthly = 0n;
  let unusedAnnual = 0n;
  for (const s of subs) {
    if (s.status === "CANCELLED" || s.status === "EXPIRED") continue;
    monthly += BigInt(s.monthlyCost.minor);
    if (s.looksUnused) unusedAnnual += BigInt(s.annualCost.minor);
  }

  return {
    monthlyTotal: toDTO(money(monthly, currency)),
    annualTotal: toDTO(money(monthly * 12n, currency)),
    activeCount: subs.filter((s) => s.status === "ACTIVE").length,
    trialCount: subs.filter((s) => s.status === "TRIAL").length,
    unusedCount: subs.filter((s) => s.looksUnused).length,
    unusedAnnualCost: toDTO(money(unusedAnnual, currency)),
    trialsEndingSoon: subs.filter((s) => s.daysUntilTrialEnd !== null && s.daysUntilTrialEnd >= 0 && s.daysUntilTrialEnd <= 14),
    renewingSoon: subs.filter((s) => s.daysUntilRenewal !== null && s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 7),
    unused: subs.filter((s) => s.looksUnused),
  };
}

/**
 * Refresh "last used" from linked charges.
 *
 * A subscription that keeps charging but whose merchant shows no *other*
 * activity is the signal worth surfacing — a gym you pay for but never visit
 * still has a monthly charge, so charge dates alone prove nothing.
 */
export async function refreshUsage(actor: ActorContext, db: Db = rootDb): Promise<number> {
  const subs = await db
    .select({
      id: subscriptions.id,
      merchantId: subscriptions.merchantId,
      recurringId: subscriptions.recurringId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, actor.userId),
        isNull(subscriptions.deletedAt),
        inArray(subscriptions.status, ["ACTIVE", "TRIAL"]),
        isNotNull(subscriptions.merchantId),
      ),
    );

  let updated = 0;
  for (const sub of subs) {
    const lastNonSubscriptionActivity = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.userId, actor.userId),
        eq(transactions.merchantId, sub.merchantId!),
        isNull(transactions.deletedAt),
        // Exclude the subscription's own recurring charges.
        sub.recurringId ? ne(transactions.recurringId, sub.recurringId) : undefined,
      ),
      orderBy: [desc(transactions.occurredAt)],
      columns: { occurredAt: true },
    });

    if (lastNonSubscriptionActivity) {
      await db
        .update(subscriptions)
        .set({ lastUsedAt: lastNonSubscriptionActivity.occurredAt })
        .where(eq(subscriptions.id, sub.id));
      updated++;
    }
  }
  return updated;
}

/** Subscriptions with a trial ending or a renewal within the window. */
export async function dueForAlert(
  now = new Date(),
  db: Db = rootDb,
): Promise<Array<{ userId: string; subscriptionId: string; name: string; kind: "TRIAL_ENDING" | "RENEWAL"; on: Date; priceMinor: bigint; currency: string; daysUntil: number; dedupeKey: string }>> {
  const today = startOfUtcDay(now);
  const horizon = addDays(today, 7);

  const rows = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      name: subscriptions.name,
      trialEndsOn: subscriptions.trialEndsOn,
      renewsOn: subscriptions.renewsOn,
      priceMinor: subscriptions.priceMinor,
      currency: subscriptions.currency,
    })
    .from(subscriptions)
    .where(
      and(
        isNull(subscriptions.deletedAt),
        inArray(subscriptions.status, ["ACTIVE", "TRIAL"]),
        or(
          and(
            gte(subscriptions.trialEndsOn, today),
            lte(subscriptions.trialEndsOn, horizon),
          ),
          and(gte(subscriptions.renewsOn, today), lte(subscriptions.renewsOn, horizon)),
        ),
      ),
    );

  const out: Awaited<ReturnType<typeof dueForAlert>> = [];
  for (const row of rows) {
    const push = (kind: "TRIAL_ENDING" | "RENEWAL", on: Date) => {
      const daysUntil = Math.ceil((startOfUtcDay(on).getTime() - today.getTime()) / 86_400_000);
      // Trials get three nudges; renewals get one.
      if (kind === "TRIAL_ENDING" && ![7, 3, 1, 0].includes(daysUntil)) return;
      if (kind === "RENEWAL" && daysUntil > 3) return;
      out.push({
        userId: row.userId,
        subscriptionId: row.id,
        name: row.name,
        kind,
        on,
        priceMinor: row.priceMinor,
        currency: row.currency,
        daysUntil,
        dedupeKey: `${kind.toLowerCase()}:${row.id}:${on.toISOString().slice(0, 10)}:${daysUntil}`,
      });
    };
    if (row.trialEndsOn) push("TRIAL_ENDING", row.trialEndsOn);
    if (row.renewsOn) push("RENEWAL", row.renewsOn);
  }
  return out;
}

function frequencyForCycle(cycle: string): "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" {
  switch (cycle) {
    case "WEEKLY": return "WEEKLY";
    case "QUARTERLY": return "QUARTERLY";
    case "ANNUAL": return "YEARLY";
    case "SEMIANNUAL": return "MONTHLY"; // with interval 6
    default: return "MONTHLY";
  }
}

function nextRenewal(startedOn: Date, cycle: string, cycleCount: number): Date {
  const months = (CYCLE_MONTHS[cycle] ?? 1) * Math.max(1, cycleCount);
  if (cycle === "WEEKLY") return addDays(startedOn, 7 * Math.max(1, cycleCount));
  return addMonthsClamped(startedOn, Math.round(months));
}
