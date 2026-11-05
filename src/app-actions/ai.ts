"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as runner from "@/src/server/ai/runner";
import * as features from "@/src/server/ai/features";
import { aiChatSchema, confirmToolCallSchema } from "@/src/lib/schemas";

/**
 * Server Actions for the assistant.
 *
 * `confirmProposalAction` is the security boundary: it takes only a proposal id
 * and a decision from the user. The stored proposal is re-read under the actor's
 * scope and every ownership check re-runs, because an unbounded amount of time
 * may have passed since the model suggested it.
 */

export interface ChatResponse {
  conversationId: string;
  text: string;
  toolCalls: Array<{
    id: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    mutating: boolean;
    status: string;
    summary?: string;
    durationMs: number | null;
  }>;
}

export async function askAssistantAction(input: unknown): Promise<ActionResult<ChatResponse>> {
  try {
    const actor = await requireActor();
    const parsed = aiChatSchema.parse(input);
    const result = await runner.chat(actor, {
      conversationId: parsed.conversationId,
      message: parsed.message,
    });

    return actionOk({
      conversationId: result.conversationId,
      text: result.text,
      toolCalls: result.toolCalls.map((t) => ({
        id: t.id,
        toolName: t.toolName,
        input: t.input,
        output: t.output,
        mutating: t.mutating,
        status: t.status,
        summary: t.summary,
        durationMs: t.durationMs,
      })),
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function confirmProposalAction(
  toolCallId: string,
  decision: "CONFIRM" | "CANCEL",
  overrides?: Record<string, unknown>,
): Promise<ActionResult<{ status: string; output: unknown }>> {
  try {
    const actor = await requireActor();
    const parsed = confirmToolCallSchema.parse({ toolCallId, decision, overrides });
    const result = await runner.confirmToolCall(
      actor,
      parsed.toolCallId,
      parsed.decision,
      parsed.overrides,
    );

    if (parsed.decision === "CONFIRM") {
      // A confirmed mutation can touch almost anything, so revalidate broadly.
      for (const path of ["/", "/transactions", "/accounts", "/budgets", "/goals", "/analytics"]) {
        revalidatePath(path);
      }
    }

    return actionOk({ status: result.status, output: result.output });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteConversationAction(id: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await runner.deleteConversation(actor, id);
    revalidatePath("/assistant");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

/** Categorise the review queue, applying only the confident results. */
export async function categoriseUncategorisedAction(): Promise<
  ActionResult<{ applied: number; flagged: number; considered: number }>
> {
  try {
    const actor = await requireActor();
    const { db } = await import("@/src/server/db");
    const { transactions } = await import("@/src/server/db/schema");
    const { and, desc, eq, isNull } = await import("drizzle-orm");

    const pending = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, actor.userId),
          isNull(transactions.categoryId),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.occurredAt))
      .limit(40);
    if (pending.length === 0) return actionOk({ applied: 0, flagged: 0, considered: 0 });

    const results = await features.categoriseTransactions(actor, pending.map((p) => p.id));
    const applied = await features.applyCategorisations(actor, results, { autoApplyAbove: 0.8 });

    revalidatePath("/transactions");
    revalidatePath("/budgets");
    return actionOk({ ...applied, considered: pending.length });
  } catch (error) {
    return actionError(error);
  }
}

/** Generate a brief on demand, for the "regenerate" affordance. */
export async function generateBriefAction(): Promise<ActionResult<features.Brief | null>> {
  try {
    const actor = await requireActor();
    const brief = await features.generateBrief(actor);
    return actionOk(brief);
  } catch (error) {
    return actionError(error);
  }
}

export async function suggestBudgetsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof features.suggestBudgets>>>
> {
  try {
    const actor = await requireActor();
    const result = await features.suggestBudgets(actor);
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}
