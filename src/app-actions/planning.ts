"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as budgetService from "@/src/server/services/budget-service";
import * as goalService from "@/src/server/services/goal-service";
import * as debtService from "@/src/server/services/debt-service";
import * as lendingService from "@/src/server/services/lending-service";
import * as billService from "@/src/server/services/bill-service";
import * as subscriptionService from "@/src/server/services/subscription-service";
import * as recurringService from "@/src/server/services/recurring-service";
import * as ruleService from "@/src/server/services/rule-service";
import {
  closeReconciliationSchema, contributeToGoalSchema, createBillSchema, createBudgetSchema,
  createDebtSchema, createGoalSchema, createLendingSchema, createRecurringSchema,
  createRuleSchema, createSavingsTargetSchema, createSubscriptionSchema,
  depositToTargetSchema, payBillSchema, previewSavingsPlanSchema,
  recordDebtPaymentSchema,
  recordLendingPaymentSchema, startReconciliationSchema, updateBudgetSchema, updateGoalSchema,
  updateRecurringSchema, updateSubscriptionSchema,
} from "@/src/lib/schemas";
import * as reconciliationService from "@/src/server/services/reconciliation-service";
import * as savingsTargetService from "@/src/server/services/savings-target-service";

/**
 * Server Actions for the planning surfaces.
 *
 * Same shape as every other action file: resolve the actor, validate, call the
 * service, revalidate what changed. The `try`/`actionError` wrapper is what
 * turns a thrown AppError into a renderable message instead of a crash.
 */

const paths = (...list: string[]) => {
  for (const path of list) revalidatePath(path);
};

/* -------------------------------------------------------------- budgets */

export async function createBudgetAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const budget = await budgetService.create(actor, createBudgetSchema.parse(input));
    paths("/", "/budgets");
    return actionOk({ id: budget.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateBudgetAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const budget = await budgetService.update(actor, id, updateBudgetSchema.parse(input));
    paths("/", "/budgets", `/budgets/${id}`);
    return actionOk({ id: budget.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteBudgetAction(id: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await budgetService.remove(actor, id);
    paths("/", "/budgets");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

/** Accepts the median-based suggestions and creates a budget from them. */
export async function createBudgetFromSuggestionsAction(
  name: string,
): Promise<ActionResult<{ id: string; lines: number }>> {
  try {
    const actor = await requireActor();
    const suggestions = await budgetService.suggestFromHistory(actor, { months: 3 });
    const lines = suggestions.slice(0, 12).map((s) => ({
      categoryId: s.categoryId,
      limit: s.suggested.decimal,
      rollover: false,
      fixed: false,
    }));

    const budget = await budgetService.create(
      actor,
      createBudgetSchema.parse({
        name,
        period: "MONTHLY",
        currency: actor.baseCurrency,
        categories: lines,
      }),
    );
    paths("/", "/budgets");
    return actionOk({ id: budget.id, lines: lines.length });
  } catch (error) {
    return actionError(error);
  }
}

/* ---------------------------------------------------------------- goals */

export async function createGoalAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const goal = await goalService.create(actor, createGoalSchema.parse(input));
    paths("/", "/goals");
    return actionOk({ id: goal.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateGoalAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const goal = await goalService.update(actor, id, updateGoalSchema.parse(input));
    paths("/", "/goals", `/goals/${id}`);
    return actionOk({ id: goal.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function contributeToGoalAction(
  input: unknown,
): Promise<ActionResult<{ completed: boolean; milestonesReached: string[]; saved: string }>> {
  try {
    const actor = await requireActor();
    const result = await goalService.contribute(actor, contributeToGoalSchema.parse(input));
    paths("/", "/goals", "/accounts", "/transactions");
    return actionOk({
      completed: result.completed,
      milestonesReached: result.milestonesReached,
      saved: result.goal.saved.decimal,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteGoalAction(id: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await goalService.remove(actor, id);
    paths("/", "/goals");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

/* ----------------------------------------------------------------- debt */

export async function createDebtAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const debt = await debtService.create(actor, createDebtSchema.parse(input));
    paths("/", "/debts");
    return actionOk({ id: debt.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function recordDebtPaymentAction(
  input: unknown,
): Promise<ActionResult<{ principal: string; interest: string; balanceAfter: string; cleared: boolean }>> {
  try {
    const actor = await requireActor();
    const result = await debtService.recordPayment(actor, recordDebtPaymentSchema.parse(input));
    paths("/", "/debts", "/accounts", "/transactions");
    return actionOk({
      principal: result.payment.principal.decimal,
      interest: result.payment.interest.decimal,
      balanceAfter: result.payment.balanceAfter.decimal,
      cleared: result.clearedDebt,
    });
  } catch (error) {
    return actionError(error);
  }
}

/* -------------------------------------------------------------- lending */

export async function createLendingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const result = await lendingService.create(actor, createLendingSchema.parse(input));
    paths("/", "/lending", "/accounts", "/transactions");
    return actionOk({ id: result.record.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function recordLendingPaymentAction(
  input: unknown,
): Promise<ActionResult<{ outstanding: string; settled: boolean }>> {
  try {
    const actor = await requireActor();
    const result = await lendingService.recordPayment(actor, recordLendingPaymentSchema.parse(input));
    paths("/", "/lending", "/accounts", "/transactions");
    return actionOk({ outstanding: result.record.outstanding.decimal, settled: result.settled });
  } catch (error) {
    return actionError(error);
  }
}

export async function writeOffLendingAction(id: string, reason?: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await lendingService.writeOff(actor, id, reason);
    paths("/lending");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

/* ---------------------------------------------------------------- bills */

export async function createBillAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const bill = await billService.create(actor, createBillSchema.parse(input));
    paths("/", "/bills", "/calendar");
    return actionOk({ id: bill.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function payBillAction(input: unknown): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const actor = await requireActor();
    const result = await billService.pay(actor, payBillSchema.parse(input));
    paths("/", "/bills", "/calendar", "/accounts", "/transactions", "/budgets");
    return actionOk({ transactionId: result.transactionId });
  } catch (error) {
    return actionError(error);
  }
}

export async function skipBillAction(occurrenceId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await billService.skip(actor, occurrenceId);
    paths("/", "/bills", "/calendar");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

/* -------------------------------------------------------- subscriptions */

export async function createSubscriptionAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const sub = await subscriptionService.create(actor, createSubscriptionSchema.parse(input));
    paths("/", "/subscriptions", "/recurring");
    return actionOk({ id: sub.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateSubscriptionAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const sub = await subscriptionService.update(actor, id, updateSubscriptionSchema.parse(input));
    paths("/subscriptions");
    return actionOk({ id: sub.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelSubscriptionAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const sub = await subscriptionService.cancel(actor, id);
    paths("/", "/subscriptions", "/recurring");
    return actionOk({ id: sub.id });
  } catch (error) {
    return actionError(error);
  }
}

/* ------------------------------------------------------------ recurring */

export async function createRecurringAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const row = await recurringService.create(actor, createRecurringSchema.parse(input));
    paths("/", "/recurring", "/calendar");
    return actionOk({ id: row.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateRecurringAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const row = await recurringService.update(actor, id, updateRecurringSchema.parse(input));
    paths("/recurring", "/calendar");
    return actionOk({ id: row.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function setRecurringStatusAction(
  id: string,
  status: "ACTIVE" | "PAUSED" | "ENDED",
): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireActor();
    const row = await recurringService.setStatus(actor, id, status);
    paths("/", "/recurring", "/calendar");
    return actionOk({ status: row.status });
  } catch (error) {
    return actionError(error);
  }
}

export async function skipRecurringOccurrenceAction(
  id: string,
  dueOn: string,
): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await recurringService.skipOccurrence(actor, id, new Date(dueOn), "Skipped by the user");
    paths("/recurring", "/calendar");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

/* ---------------------------------------------------------------- rules */

export async function createRuleAction(input: unknown): Promise<ActionResult<{ id: string; backfilled: number }>> {
  try {
    const actor = await requireActor();
    const rule = await ruleService.create(actor, createRuleSchema.parse(input));
    paths("/rules", "/transactions");
    return actionOk({ id: rule.id, backfilled: rule.backfilled });
  } catch (error) {
    return actionError(error);
  }
}

export async function dryRunRuleAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof ruleService.dryRun>>>> {
  try {
    const actor = await requireActor();
    const parsed = createRuleSchema.parse(input);
    const result = await ruleService.dryRun(actor, parsed);
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleRuleAction(id: string, enabled: boolean): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await ruleService.update(actor, id, { enabled });
    paths("/rules");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteRuleAction(id: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await ruleService.remove(actor, id);
    paths("/rules");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

export async function applyRuleToHistoryAction(id: string): Promise<ActionResult<{ updated: number }>> {
  try {
    const actor = await requireActor();
    const result = await ruleService.applyToHistory(actor, id);
    paths("/rules", "/transactions", "/budgets", "/analytics");
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

/* -------------------------------------------------------- reconciliation */

export async function startReconciliationAction(
  input: unknown,
): Promise<ActionResult<{ id: string; difference: string }>> {
  try {
    const actor = await requireActor();
    const workspace = await reconciliationService.start(actor, startReconciliationSchema.parse(input));
    paths("/reconcile", "/accounts");
    return actionOk({ id: workspace.id, difference: workspace.difference.decimal });
  } catch (error) {
    return actionError(error);
  }
}

export async function closeReconciliationAction(
  input: unknown,
): Promise<ActionResult<{ status: string; adjustment: string }>> {
  try {
    const actor = await requireActor();
    const result = await reconciliationService.close(actor, closeReconciliationSchema.parse(input));
    paths("/reconcile", "/accounts", "/transactions", "/");
    return actionOk({ status: result.status, adjustment: result.adjustment.decimal });
  } catch (error) {
    return actionError(error);
  }
}

/* ------------------------------------------------------- savings targets */

/**
 * Model a savings plan without committing to it.
 *
 * A read, on purpose: the planner recalculates as the person types, and nothing
 * should reach the database until they decide. Validation still runs on the
 * server, so a price typed as "abc" is rejected here rather than in the client.
 */
export async function previewSavingsPlanAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof savingsTargetService.preview>>>> {
  try {
    const actor = await requireActor();
    const parsed = previewSavingsPlanSchema.parse(input);
    return actionOk(await savingsTargetService.preview(actor, parsed));
  } catch (error) {
    return actionError(error);
  }
}

export async function createSavingsTargetAction(
  input: unknown,
): Promise<ActionResult<{ id: string; months: number | null; summary: string }>> {
  try {
    const actor = await requireActor();
    const target = await savingsTargetService.create(
      actor,
      createSavingsTargetSchema.parse(input),
    );
    paths("/", "/targets", "/goals");
    return actionOk({
      id: target.id,
      months: target.monthsRemaining,
      summary: target.summary,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function depositToTargetAction(
  input: unknown,
): Promise<
  ActionResult<{ completed: boolean; saved: string; remaining: string; summary: string }>
> {
  try {
    const actor = await requireActor();
    const parsed = depositToTargetSchema.parse(input);
    const result = await savingsTargetService.deposit(actor, {
      ...parsed,
      occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : undefined,
    });
    paths("/", "/targets", "/goals", "/accounts", "/transactions");
    return actionOk({
      completed: result.completed,
      saved: result.target.saved.decimal,
      remaining: result.target.remaining.decimal,
      summary: result.target.summary,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteSavingsTargetAction(id: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await savingsTargetService.remove(actor, id);
    paths("/", "/targets", "/goals");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}
