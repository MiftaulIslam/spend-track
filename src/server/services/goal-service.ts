import { and, asc, desc, eq, inArray, isNull, sum } from "drizzle-orm";
import { db as rootDb, withTransaction, type Db } from "@/src/server/db";
import {
  accounts,
  goalContributions,
  goalMilestones,
  goals,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { NotFoundError, ValidationError } from "@/src/server/errors";
import * as audit from "./audit-service";
import * as transferService from "./transfer-service";
import { money, toDTO, zero, type MoneyDTO } from "@/src/domain/money";
import { evaluate, evaluateMilestones, projectSeries, type GoalPace } from "@/src/domain/goal";
import { parseAmountForCurrency } from "@/src/lib/schemas";
import type { CreateGoalInput } from "@/src/lib/schemas";
import * as z from "zod";
import type { contributeToGoalSchema, updateGoalSchema } from "@/src/lib/schemas";

/**
 * Goals.
 *
 * A contribution is a real transfer into the linked account, not a number in a
 * goal row. That means "saved" can be reconciled against the account balance,
 * and a user cannot end up with a goal that says $3,840 while the savings
 * account holds $900.
 */

export interface GoalDTO {
  id: string;
  name: string;
  currency: string;
  target: MoneyDTO;
  saved: MoneyDTO;
  remaining: MoneyDTO;
  fraction: number;
  targetDate: string | null;
  daysRemaining: number | null;
  contribution: MoneyDTO | null;
  contributionFreq: string | null;
  requiredPerPeriod: MoneyDTO | null;
  projectedCompletion: string | null;
  pace: GoalPace;
  daysAheadOfPlan: number | null;
  status: string;
  colorIndex: number;
  icon: string;
  note: string | null;
  linkedAccountId: string | null;
  linkedAccountName: string | null;
  milestones: Array<{ id: string; name: string; amount: MoneyDTO; reached: boolean; fraction: number }>;
  contributionCount: number;
}

/**
 * Reshape a loaded goal for the DTO mapper: milestones and the linked account
 * keep their names, and the contribution count comes from the ids already
 * fetched rather than a second round trip.
 */
type MilestoneRow = typeof goalMilestones.$inferSelect;

function shape<
  T extends {
    goalMilestones: MilestoneRow[];
    goalContributions: unknown[];
    account: { id: string; name: string } | null;
  },
>(row: T) {
  const { goalMilestones: ms, goalContributions: cs, account, ...rest } = row;
  return {
    ...rest,
    milestones: ms,
    linkedAccount: account,
    _count: { contributions: cs.length },
  };
}

type GoalRow = Awaited<ReturnType<typeof loadGoal>>;

async function loadGoal(userId: string, id: string, db: Db) {
  const row = await db.query.goals.findFirst({
    where: and(eq(goals.id, id), eq(goals.userId, userId), isNull(goals.deletedAt)),
    with: {
      goalMilestones: { orderBy: [asc(goalMilestones.sortOrder)] },
      account: { columns: { id: true, name: true } },
      goalContributions: { columns: { id: true } },
    },
  });
  return row ? shape(row) : undefined;
}

/** Saved amount is always the sum of contributions — never a stored field. */
async function savedMinor(goalId: string, db: Db): Promise<bigint> {
  // SUM(bigint) comes back as a string from Postgres (a sum of int8 can
  // overflow int8), so it is converted explicitly rather than trusted.
  const [result] = await db
    .select({ total: sum(goalContributions.amountMinor) })
    .from(goalContributions)
    .where(eq(goalContributions.goalId, goalId));
  return result?.total == null ? 0n : BigInt(result.total);
}

async function hydrate(goal: NonNullable<GoalRow>, db: Db): Promise<GoalDTO> {
  const saved = money(await savedMinor(goal.id, db), goal.currency);
  const target = money(goal.targetMinor, goal.currency);
  const contribution = goal.contributionMinor !== null ? money(goal.contributionMinor, goal.currency) : null;

  const progress = evaluate({
    target,
    saved,
    targetDate: goal.targetDate,
    contribution,
    contributionFrequency: goal.contributionFreq as never,
  });

  const milestones = evaluateMilestones(
    goal.milestones.map((m) => ({ id: m.id, name: m.name, amount: money(m.amountMinor, goal.currency) })),
    saved,
  );

  return {
    id: goal.id,
    name: goal.name,
    currency: goal.currency,
    target: toDTO(target),
    saved: toDTO(saved),
    remaining: toDTO(progress.remaining),
    fraction: progress.fraction,
    targetDate: goal.targetDate?.toISOString() ?? null,
    daysRemaining: progress.daysRemaining,
    contribution: contribution ? toDTO(contribution) : null,
    contributionFreq: goal.contributionFreq,
    requiredPerPeriod: progress.requiredPerPeriod ? toDTO(progress.requiredPerPeriod) : null,
    projectedCompletion: progress.projectedCompletion?.toISOString() ?? null,
    pace: progress.pace,
    daysAheadOfPlan: progress.daysAheadOfPlan,
    status: goal.status,
    colorIndex: goal.colorIndex,
    icon: goal.icon,
    note: goal.note,
    linkedAccountId: goal.linkedAccountId,
    linkedAccountName: goal.linkedAccount?.name ?? null,
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      amount: toDTO(m.amount),
      reached: m.reached,
      fraction: m.fraction,
    })),
    contributionCount: goal._count.contributions,
  };
}

export async function list(actor: ActorContext, options: { includeCompleted?: boolean } = {}, db: Db = rootDb): Promise<GoalDTO[]> {
  const loaded = await db.query.goals.findMany({
    where: and(
      eq(goals.userId, actor.userId),
      isNull(goals.deletedAt),
      options.includeCompleted ? undefined : inArray(goals.status, ["ACTIVE", "PAUSED"]),
    ),
    orderBy: [asc(goals.status), asc(goals.targetDate), asc(goals.createdAt)],
    with: {
      goalMilestones: { orderBy: [asc(goalMilestones.sortOrder)] },
      account: { columns: { id: true, name: true } },
      goalContributions: { columns: { id: true } },
    },
  });
  const rows = loaded.map(shape);
  return Promise.all(rows.map((r) => hydrate(r, db)));
}

export async function get(actor: ActorContext, id: string, db: Db = rootDb): Promise<GoalDTO> {
  const row = await loadGoal(actor.userId, id, db);
  if (!row) throw new NotFoundError("That goal");
  return hydrate(row, db);
}

export async function create(actor: ActorContext, input: CreateGoalInput): Promise<GoalDTO> {
  return withTransaction(rootDb, async (tx) => {
    if (input.linkedAccountId) {
      const account = await tx.query.accounts.findFirst({
        where: and(
          eq(accounts.id, input.linkedAccountId),
          eq(accounts.userId, actor.userId),
          isNull(accounts.deletedAt),
        ),
        columns: { id: true },
      });
      if (!account) throw new NotFoundError("That account");
    }

    const targetMinor = parseAmountForCurrency(input.target, input.currency, actor.locale);
    if (targetMinor <= 0n) throw new ValidationError("A goal needs a target above zero.");

    const [inserted] = await tx
      .insert(goals)
      .values({
        userId: actor.userId,
        name: input.name,
        targetMinor,
        currency: input.currency,
        targetDate: input.targetDate,
        linkedAccountId: input.linkedAccountId,
        contributionMinor: input.contribution
          ? parseAmountForCurrency(input.contribution, input.currency, actor.locale)
          : null,
        contributionFreq: input.contributionFreq,
        colorIndex: input.colorIndex,
        icon: input.icon,
        note: input.note,
      })
      .returning();
    if (!inserted) throw new NotFoundError("That goal");

    // Milestones are a separate insert now: Drizzle has no nested writes, and
    // the enclosing transaction is what keeps them together.
    const milestoneRows = input.milestones.length
      ? await tx
          .insert(goalMilestones)
          .values(
            input.milestones.map((m, i) => ({
              goalId: inserted.id,
              name: m.name,
              amountMinor: parseAmountForCurrency(m.amount, input.currency, actor.locale),
              sortOrder: i,
            })),
          )
          .returning()
      : [];

    const goal = shape({
      ...inserted,
      goalMilestones: milestoneRows,
      goalContributions: [],
      account: null,
    });

    await audit.record(
      actor,
      { action: "goal.create", entityType: "Goal", entityId: goal.id, after: { name: goal.name, targetMinor, targetDate: goal.targetDate } },
      tx,
    );
    return hydrate(goal, tx);
  });
}

export async function update(
  actor: ActorContext,
  id: string,
  input: z.infer<typeof updateGoalSchema>,
): Promise<GoalDTO> {
  return withTransaction(rootDb, async (tx) => {
    const before = await loadGoal(actor.userId, id, tx);
    if (!before) throw new NotFoundError("That goal");

    await tx
      .update(goals)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.target !== undefined
          ? { targetMinor: parseAmountForCurrency(input.target, before.currency, actor.locale) }
          : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
        ...(input.linkedAccountId !== undefined ? { linkedAccountId: input.linkedAccountId } : {}),
        ...(input.contribution !== undefined
          ? {
              contributionMinor: input.contribution
                ? parseAmountForCurrency(input.contribution, before.currency, actor.locale)
                : null,
            }
          : {}),
        ...(input.contributionFreq !== undefined ? { contributionFreq: input.contributionFreq } : {}),
        ...(input.colorIndex !== undefined ? { colorIndex: input.colorIndex } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.status !== undefined
          ? { status: input.status, completedAt: input.status === "COMPLETED" ? new Date() : null }
          : {}),
      })
      .where(and(eq(goals.id, id), eq(goals.userId, actor.userId)));

    if (input.milestones) {
      await tx.delete(goalMilestones).where(eq(goalMilestones.goalId, id));
      if (input.milestones.length) {
        await tx.insert(goalMilestones).values(
          input.milestones.map((m, i) => ({
            goalId: id,
            name: m.name,
            amountMinor: parseAmountForCurrency(m.amount, before.currency, actor.locale),
            sortOrder: i,
          })),
        );
      }
    }

    const after = await loadGoal(actor.userId, id, tx);
    if (!after) throw new NotFoundError("That goal");

    await audit.record(
      actor,
      {
        action: "goal.update",
        entityType: "Goal",
        entityId: id,
        before: { name: before.name, targetMinor: before.targetMinor, status: before.status },
        after: { name: after.name, targetMinor: after.targetMinor, status: after.status },
      },
      tx,
    );
    return hydrate(after, tx);
  });
}

export async function remove(actor: ActorContext, id: string): Promise<void> {
  const before = await rootDb.query.goals.findFirst({
    where: and(eq(goals.id, id), eq(goals.userId, actor.userId), isNull(goals.deletedAt)),
  });
  if (!before) throw new NotFoundError("That goal");
  await rootDb
    .update(goals)
    .set({ deletedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, actor.userId)));
  await audit.record(actor, { action: "goal.delete", entityType: "Goal", entityId: id, before });
}

/**
 * Contribute to a goal.
 *
 * With a source account this creates a real transfer into the linked account
 * and links the resulting transaction to the contribution. Without one — for a
 * goal not backed by a specific account — the contribution is recorded on its
 * own, which is honest about there being no money movement to point at.
 */
export async function contribute(
  actor: ActorContext,
  input: z.infer<typeof contributeToGoalSchema>,
): Promise<{ goal: GoalDTO; transactionId: string | null; completed: boolean; milestonesReached: string[] }> {
  return withTransaction(rootDb, async (tx) => {
    const goal = await loadGoal(actor.userId, input.goalId, tx);
    if (!goal) throw new NotFoundError("That goal");
    if (goal.status === "COMPLETED") throw new ValidationError("That goal is already complete.");

    const amountMinor = parseAmountForCurrency(input.amount, goal.currency, actor.locale);
    if (amountMinor <= 0n) throw new ValidationError("Enter an amount above zero.");

    const before = await savedMinor(goal.id, tx);
    const reachedBefore = new Set(
      evaluateMilestones(
        goal.milestones.map((m) => ({ id: m.id, name: m.name, amount: money(m.amountMinor, goal.currency) })),
        money(before, goal.currency),
      ).filter((m) => m.reached).map((m) => m.id),
    );

    const [contribution] = await tx
      .insert(goalContributions)
      .values({
        goalId: goal.id,
        amountMinor,
        occurredAt: input.occurredAt,
        note: input.note,
      })
      .returning({ id: goalContributions.id });
    if (!contribution) throw new NotFoundError("That goal");

    let transactionId: string | null = null;
    if (input.fromAccountId && goal.linkedAccountId) {
      const transfer = await transferService.create(
        actor,
        {
          fromAccountId: input.fromAccountId,
          toAccountId: goal.linkedAccountId,
          amount: input.amount,
          occurredAt: input.occurredAt,
          note: input.note ?? `Contribution to ${goal.name}`,
        },
        { kindHint: "GOAL_CONTRIBUTION", goalContributionId: contribution.id, db: tx },
      );
      transactionId = transfer.outTransactionId;
      await tx
        .update(goalContributions)
        .set({ transactionId: transfer.outTransactionId })
        .where(eq(goalContributions.id, contribution.id));
    }

    const after = await savedMinor(goal.id, tx);
    const completed = after >= goal.targetMinor;
    // The guard at the top already rejected an already-complete goal.
    if (completed) {
      await tx
        .update(goals)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(and(eq(goals.id, goal.id), eq(goals.userId, actor.userId)));
    }

    const reachedAfter = evaluateMilestones(
      goal.milestones.map((m) => ({ id: m.id, name: m.name, amount: money(m.amountMinor, goal.currency) })),
      money(after, goal.currency),
    ).filter((m) => m.reached);

    const newlyReached = reachedAfter.filter((m) => !reachedBefore.has(m.id));
    if (newlyReached.length > 0) {
      await tx
        .update(goalMilestones)
        .set({ reachedAt: new Date() })
        .where(
          inArray(
            goalMilestones.id,
            newlyReached.map((m) => m.id),
          ),
        );
    }

    await audit.record(
      actor,
      {
        action: "goal.contribute",
        entityType: "Goal",
        entityId: goal.id,
        after: { amountMinor, savedMinor: after, completed },
      },
      tx,
    );

    const refreshed = await loadGoal(actor.userId, goal.id, tx);
    return {
      goal: await hydrate(refreshed!, tx),
      transactionId,
      completed,
      milestonesReached: newlyReached.map((m) => m.name),
    };
  });
}

export async function contributions(actor: ActorContext, goalId: string, limit = 50) {
  const goal = await rootDb.query.goals.findFirst({
    where: and(eq(goals.id, goalId), eq(goals.userId, actor.userId), isNull(goals.deletedAt)),
    columns: { currency: true },
  });
  if (!goal) throw new NotFoundError("That goal");

  const rows = await rootDb.query.goalContributions.findMany({
    where: eq(goalContributions.goalId, goalId),
    orderBy: [desc(goalContributions.occurredAt)],
    limit,
    columns: {
      id: true,
      amountMinor: true,
      occurredAt: true,
      note: true,
      transactionId: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    amount: toDTO(money(r.amountMinor, goal.currency)),
    occurredAt: r.occurredAt.toISOString(),
    note: r.note,
    transactionId: r.transactionId,
  }));
}

/** Projected trajectory across every active goal, for the goals chart. */
export async function projection(actor: ActorContext, periods = 12, db: Db = rootDb) {
  const goals = await list(actor, {}, db);
  const points = new Map<string, bigint>();

  for (const goal of goals) {
    if (goal.status !== "ACTIVE") continue;
    const series = projectSeries(
      {
        target: money(BigInt(goal.target.minor), goal.currency),
        saved: money(BigInt(goal.saved.minor), goal.currency),
        targetDate: goal.targetDate ? new Date(goal.targetDate) : null,
        contribution: goal.contribution ? money(BigInt(goal.contribution.minor), goal.currency) : null,
        contributionFrequency: goal.contributionFreq as never,
      },
      periods,
    );
    for (const point of series) {
      const key = point.date.toISOString().slice(0, 10);
      points.set(key, (points.get(key) ?? 0n) + point.amount.minor);
    }
  }

  return [...points.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: toDTO(money(amount, actor.baseCurrency)) }));
}

export { zero };
