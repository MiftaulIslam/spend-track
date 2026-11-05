import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import {
  aiConversations,
  aiMessages,
  aiToolCalls,
  userSettings,
} from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/src/server/errors";
import { MODELS, anthropic, errorCodeOf, toAiError, usageFrom } from "./client";
import { buildSystemPrompt, capToolResult, filterForRole } from "./context-builder";
import { getTool, toolDefinitions } from "./tools";
import { recordUsage } from "./usage";
import { consume } from "@/src/lib/rate-limit";

/**
 * The agent loop.
 *
 * The important part is `runTool`: a read tool executes, a mutating tool stops
 * and becomes a `PROPOSED` row that only a separate, user-initiated confirm can
 * execute. That gate is enforced here rather than in the prompt, because a
 * prompt is a request and this is a rule.
 */

const MAX_TURNS = 8;
const MAX_HISTORY_MESSAGES = 40;

export interface ToolCallView {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: "EXECUTED" | "PROPOSED" | "CONFIRMED" | "CANCELLED" | "BLOCKED" | "FAILED";
  mutating: boolean;
  summary?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface ChatResult {
  conversationId: string;
  messageId: string;
  text: string;
  toolCalls: ToolCallView[];
  /** Proposals waiting on the person. */
  pendingConfirmations: ToolCallView[];
  usage: { inputTokens: number; outputTokens: number; latencyMs: number; model: string };
  stopReason: string | null;
}

interface ExecuteOutcome {
  result: unknown;
  status: ToolCallView["status"];
  summary?: string;
  errorMessage?: string;
}

/**
 * Run one tool call.
 *
 * `confirmed` is never taken from the model — it comes from the confirm
 * endpoint, which requires the user's own request against a stored proposal id.
 */
async function runTool(
  actor: ActorContext,
  toolName: string,
  rawInput: unknown,
  options: { confirmed: boolean; allowMutations: boolean },
): Promise<ExecuteOutcome> {
  const tool = getTool(toolName);
  if (!tool) {
    return {
      result: { error: `No tool named ${toolName}.` },
      status: "FAILED",
      errorMessage: "unknown_tool",
    };
  }

  // The model's arguments are untrusted input like any other client payload.
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      result: {
        error: "Those arguments are not valid for this tool.",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      status: "FAILED",
      errorMessage: "invalid_arguments",
    };
  }

  if (tool.mutating) {
    if (!options.allowMutations) {
      return {
        result: { blocked: true, reason: "This conversation is read-only." },
        status: "BLOCKED",
        errorMessage: "mutations_disabled",
      };
    }
    if (!options.confirmed) {
      // The gate. Nothing is written; the model is told so explicitly.
      let summary: string | undefined;
      try {
        summary = await tool.summarise?.(parsed.data as never, { actor });
      } catch (error) {
        return {
          result: {
            error: error instanceof Error ? error.message : "Could not prepare that change.",
          },
          status: "FAILED",
          errorMessage: "summarise_failed",
        };
      }
      return {
        result: {
          proposed: true,
          summary,
          message:
            "Waiting for the person to confirm. Tell them what you would do; do not say it is done.",
        },
        status: "PROPOSED",
        summary,
      };
    }
  }

  try {
    const result = await tool.handler(parsed.data as never, {
      actor,
      confirmed: options.confirmed,
    });
    return {
      result: filterForRole(actor, result),
      status: tool.mutating ? "CONFIRMED" : "EXECUTED",
    };
  } catch (error) {
    // An authorisation failure is reported to the model as a refusal, not as a
    // crash, so it can explain rather than retry.
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return { result: { error: error.userMessage }, status: "BLOCKED", errorMessage: error.code };
    }
    if (error instanceof ValidationError) {
      return {
        result: { error: error.userMessage, issues: error.issues },
        status: "FAILED",
        errorMessage: error.code,
      };
    }
    return {
      result: { error: "That didn't work." },
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    };
  }
}

/* ------------------------------------------------------------ chat entry */

export interface ChatOptions {
  conversationId?: string;
  message: string;
  allowMutations?: boolean;
  model?: string;
  db?: Db;
}

export async function chat(actor: ActorContext, options: ChatOptions): Promise<ChatResult> {
  const db = options.db ?? rootDb;

  // Rate limit before the expensive part, not after.
  const limit = await consume(`ai:chat:${actor.userId}`, { limit: 30, windowSeconds: 60 });
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, actor.userId),
    columns: { aiEnabled: true, aiAutoApplyMutations: true },
  });
  if (settings && !settings.aiEnabled) {
    throw new ForbiddenError("The assistant is turned off in your settings.");
  }

  const allowMutations = (options.allowMutations ?? true) && actor.householdRole !== "VIEWER";

  const conversation = options.conversationId
    ? await db.query.aiConversations.findFirst({
        where: and(
          eq(aiConversations.id, options.conversationId),
          eq(aiConversations.userId, actor.userId),
        ),
        columns: { id: true },
      })
    : (
        await db
          .insert(aiConversations)
          .values({
            userId: actor.userId,
            mode: "ASSISTANT",
            title: options.message.slice(0, 80),
          })
          .returning({ id: aiConversations.id })
      )[0];
  if (!conversation) throw new NotFoundError("That conversation");

  const history = await loadHistory(conversation.id, db);

  await db.insert(aiMessages).values({
    conversationId: conversation.id,
    role: "USER",
    content: [{ type: "text", text: options.message }] as never,
  });

  const { system } = await buildSystemPrompt(actor, { includeMutating: allowMutations, db });
  const tools = toolDefinitions({ includeMutating: allowMutations });
  const model = options.model ?? MODELS.chat;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: options.message },
  ];

  const toolCalls: ToolCallView[] = [];
  let finalText = "";
  let stopReason: string | null = null;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  const started = Date.now();
  let lastMessageId = "";

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic().messages.create({
        model,
        max_tokens: 8000,
        // Adaptive thinking on a 4.6+ model; depth is controlled by effort.
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [
          // The system block is stable across a conversation, so it caches.
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        tools,
        messages,
      });

      const usage = usageFrom(response.usage);
      totalInput += usage.inputTokens;
      totalOutput += usage.outputTokens;
      totalCacheRead += usage.cacheReadTokens;
      totalCacheWrite += usage.cacheWriteTokens;
      stopReason = response.stop_reason;

      // A safety decline is a 200 with stop_reason "refusal", not an exception.
      if (response.stop_reason === "refusal") {
        finalText =
          "I can't help with that one. If you think that's wrong, rephrase it and I'll try again.";
        break;
      }

      const assistantText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (assistantText) finalText = assistantText;

      const [assistantMessage] = await db
        .insert(aiMessages)
        .values({
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: response.content as never,
          model,
          stopReason: response.stop_reason,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          latencyMs: Date.now() - started,
        })
        .returning({ id: aiMessages.id });
      lastMessageId = assistantMessage.id;

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: response.content });

      // All results must come back in ONE user message, or the model learns to
      // stop making parallel calls.
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const use of toolUses) {
        const tool = getTool(use.name);
        const callStarted = Date.now();
        const outcome = await runTool(actor, use.name, use.input, {
          confirmed: false,
          allowMutations,
        });
        const durationMs = Date.now() - callStarted;

        const [record] = await db
          .insert(aiToolCalls)
          .values({
            messageId: assistantMessage!.id,
            userId: actor.userId,
            toolName: use.name,
            toolUseId: use.id,
            input: use.input as never,
            output: JSON.parse(JSON.stringify(outcome.result)) as never,
            mutating: tool?.mutating ?? false,
            status: outcome.status,
            errorCode: outcome.errorMessage,
            durationMs,
            executedAt: outcome.status === "EXECUTED" ? new Date() : null,
          })
          .returning({ id: aiToolCalls.id });

        toolCalls.push({
          id: record.id,
          toolName: use.name,
          input: use.input as Record<string, unknown>,
          output: outcome.result,
          status: outcome.status,
          mutating: tool?.mutating ?? false,
          summary: outcome.summary,
          errorMessage: outcome.errorMessage,
          durationMs,
        });

        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: capToolResult(outcome.result),
          is_error: outcome.status === "FAILED",
        });
      }

      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    await recordUsage(
      actor.userId,
      {
        feature: "CHAT",
        model,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheWriteTokens: totalCacheWrite,
        latencyMs: Date.now() - started,
        toolCalls: toolCalls.length,
        success: false,
        errorCode: errorCodeOf(error),
      },
      db,
    );
    throw toAiError(error);
  }

  await recordUsage(
    actor.userId,
    {
      feature: "CHAT",
      model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
      latencyMs: Date.now() - started,
      toolCalls: toolCalls.length,
      success: true,
    },
    db,
  );

  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversation.id));

  return {
    conversationId: conversation.id,
    messageId: lastMessageId,
    text: finalText || "I didn't find anything to say about that — try rephrasing?",
    toolCalls,
    pendingConfirmations: toolCalls.filter((t) => t.status === "PROPOSED"),
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      latencyMs: Date.now() - started,
      model,
    },
    stopReason,
  };
}

/**
 * Execute a proposal the person has confirmed.
 *
 * Re-reads the stored proposal by id under the actor's scope, re-validates it
 * and re-runs every ownership check — the time between proposing and confirming
 * is unbounded, and the world may have changed.
 */
export async function confirmToolCall(
  actor: ActorContext,
  toolCallId: string,
  decision: "CONFIRM" | "CANCEL",
  overrides?: Record<string, unknown>,
): Promise<ToolCallView> {
  // Re-read under the actor scope: a proposal id from the client is untrusted,
  // and only a PROPOSED call belonging to this user may ever be confirmed.
  const call = await rootDb.query.aiToolCalls.findFirst({
    where: and(
      eq(aiToolCalls.id, toolCallId),
      eq(aiToolCalls.userId, actor.userId),
      eq(aiToolCalls.status, "PROPOSED"),
    ),
    columns: { id: true, toolName: true, input: true, messageId: true },
  });
  if (!call) throw new NotFoundError("That proposal");

  if (decision === "CANCEL") {
    await rootDb
      .update(aiToolCalls)
      .set({ status: "CANCELLED" })
      .where(and(eq(aiToolCalls.id, call.id), eq(aiToolCalls.userId, actor.userId)));
    return {
      id: call.id,
      toolName: call.toolName,
      input: call.input as Record<string, unknown>,
      output: { cancelled: true },
      status: "CANCELLED",
      mutating: true,
      durationMs: 0,
    };
  }

  const input = { ...(call.input as Record<string, unknown>), ...(overrides ?? {}) };
  const started = Date.now();
  const outcome = await runTool(actor, call.toolName, input, {
    confirmed: true,
    allowMutations: true,
  });
  const durationMs = Date.now() - started;

  await rootDb
    .update(aiToolCalls)
    .set({
      input: input as never,
      output: JSON.parse(JSON.stringify(outcome.result)) as never,
      status: outcome.status === "CONFIRMED" ? "CONFIRMED" : outcome.status,
      errorCode: outcome.errorMessage,
      confirmedAt: new Date(),
      executedAt: outcome.status === "CONFIRMED" ? new Date() : null,
      durationMs,
    })
    .where(and(eq(aiToolCalls.id, call.id), eq(aiToolCalls.userId, actor.userId)));

  return {
    id: call.id,
    toolName: call.toolName,
    input,
    output: outcome.result,
    status: outcome.status,
    mutating: true,
    errorMessage: outcome.errorMessage,
    durationMs,
  };
}

/** Replay a conversation for the model, trimmed to the recent window. */
async function loadHistory(conversationId: string, db: Db): Promise<Anthropic.MessageParam[]> {
  const rows = await db.query.aiMessages.findMany({
    where: and(
      eq(aiMessages.conversationId, conversationId),
      inArray(aiMessages.role, ["USER", "ASSISTANT"]),
    ),
    orderBy: [asc(aiMessages.createdAt)],
    limit: MAX_HISTORY_MESSAGES,
    columns: { role: true, content: true },
  });

  const out: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    const content = row.content as unknown;
    if (!content) continue;
    out.push({
      role: row.role === "USER" ? "user" : "assistant",
      content: content as Anthropic.MessageParam["content"],
    });
  }

  // A trimmed history must still start with a user turn.
  while (out.length > 0 && out[0].role !== "user") out.shift();
  return out;
}

export async function listConversations(actor: ActorContext, limit = 30) {
  const rows = await rootDb
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      mode: aiConversations.mode,
      pinned: aiConversations.pinned,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
      messageCount: sql<number>`(
        SELECT count(*)::int FROM ai_messages m WHERE m."conversationId" = ${aiConversations.id}
      )`,
    })
    .from(aiConversations)
    .where(
      and(eq(aiConversations.userId, actor.userId), isNull(aiConversations.archivedAt)),
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "Untitled",
    mode: r.mode,
    pinned: r.pinned,
    messageCount: r.messageCount,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getConversation(actor: ActorContext, id: string) {
  const loaded = await rootDb.query.aiConversations.findFirst({
    where: and(eq(aiConversations.id, id), eq(aiConversations.userId, actor.userId)),
    columns: { id: true, title: true, mode: true, createdAt: true },
    with: {
      aiMessages: {
        orderBy: [asc(aiMessages.createdAt)],
        columns: {
          id: true,
          role: true,
          content: true,
          model: true,
          latencyMs: true,
          createdAt: true,
        },
        with: {
          aiToolCalls: {
            columns: {
              id: true,
              toolName: true,
              input: true,
              output: true,
              mutating: true,
              status: true,
              durationMs: true,
            },
          },
        },
      },
    },
  });
  const conversation = loaded
    ? {
        ...loaded,
        messages: loaded.aiMessages.map(({ aiToolCalls, ...m }) => ({
          ...m,
          toolCalls: aiToolCalls,
        })),
      }
    : undefined;
  if (!conversation) throw new NotFoundError("That conversation");
  return conversation;
}

export async function deleteConversation(actor: ActorContext, id: string): Promise<void> {
  const removed = await rootDb
    .delete(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, actor.userId)))
    .returning({ id: aiConversations.id });
  if (removed.length === 0) throw new NotFoundError("That conversation");
}
