import { and, eq, gte } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { aiUsage } from "@/src/server/db/schema";
import { estimateCostMicros, microsToUsd } from "./client";

/**
 * AI usage recording.
 *
 * Written for every request including failures, so the admin dashboard's error
 * rate and its cost figure come from the same table and cannot disagree.
 */

export type AIFeature =
  | "CHAT"
  | "CATEGORISE"
  | "RECEIPT_EXTRACT"
  | "MERCHANT_MATCH"
  | "WEEKLY_BRIEF"
  | "ANOMALY_DETECT"
  | "RECURRING_DETECT"
  | "BUDGET_SUGGEST"
  | "FORECAST"
  | "REPORT_NARRATIVE"
  | "AGENT";

export interface UsageInput {
  feature: AIFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs?: number;
  toolCalls?: number;
  success: boolean;
  errorCode?: string;
}

export async function recordUsage(
  userId: string,
  input: UsageInput,
  db: Db = rootDb,
): Promise<void> {
  const usage = {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens ?? 0,
    cacheWriteTokens: input.cacheWriteTokens ?? 0,
  };

  await db
    .insert(aiUsage)
    .values({
      userId,
      feature: input.feature,
      model: input.model,
      ...usage,
      estimatedCostMicros: estimateCostMicros(input.model, usage),
      latencyMs: input.latencyMs,
      toolCalls: input.toolCalls ?? 0,
      success: input.success,
      errorCode: input.errorCode,
    })
    // Telemetry must never fail the operation it describes.
    .catch(() => undefined);
}

export interface UsageSummary {
  requests: number;
  successRate: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  toolCalls: number;
}

/** Per-user usage, for the settings page and for quota display. */
export async function summaryForUser(
  userId: string,
  sinceDays = 30,
  db: Db = rootDb,
): Promise<UsageSummary> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db.query.aiUsage.findMany({
    where: and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)),
    columns: {
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      estimatedCostMicros: true,
      latencyMs: true,
      toolCalls: true,
      success: true,
    },
  });
  return summarise(rows);
}

export function summarise(
  rows: Array<{
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCostMicros: bigint;
    latencyMs: number | null;
    toolCalls: number;
    success: boolean;
  }>,
): UsageSummary {
  if (rows.length === 0) {
    return {
      requests: 0,
      successRate: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      estimatedCostUsd: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      toolCalls: 0,
    };
  }

  const latencies = rows.map((r) => r.latencyMs ?? 0).sort((a, b) => a - b);
  const at = (p: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))];

  return {
    requests: rows.length,
    successRate: rows.filter((r) => r.success).length / rows.length,
    inputTokens: rows.reduce((a, r) => a + r.inputTokens, 0),
    outputTokens: rows.reduce((a, r) => a + r.outputTokens, 0),
    cacheReadTokens: rows.reduce((a, r) => a + r.cacheReadTokens, 0),
    estimatedCostUsd: microsToUsd(rows.reduce((a, r) => a + r.estimatedCostMicros, 0n)),
    p50LatencyMs: at(0.5),
    p95LatencyMs: at(0.95),
    toolCalls: rows.reduce((a, r) => a + r.toolCalls, 0),
  };
}
