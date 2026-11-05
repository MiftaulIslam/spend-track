import Anthropic from "@anthropic-ai/sdk";
import { UpstreamError } from "@/src/server/errors";

/**
 * The Anthropic client, model roster and cost model.
 *
 * Model choice is a per-feature decision recorded here rather than scattered
 * through the codebase: categorising a transaction is a Haiku job, a
 * conversation is a Sonnet job, and multi-step agent planning is the only thing
 * that justifies Opus.
 */

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new UpstreamError("The assistant", new Error("ANTHROPIC_API_KEY is not configured"));
  }
  cached = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  return cached;
}

export const aiConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

export const MODELS = {
  /** Conversation, analysis, report narratives. */
  chat: process.env.AI_MODEL_CHAT || "claude-sonnet-5",
  /** High-volume, low-judgement work: categorisation, merchant matching. */
  fast: process.env.AI_MODEL_FAST || "claude-haiku-4-5",
  /** Multi-step agent planning only — the one place the extra cost pays. */
  deep: process.env.AI_MODEL_DEEP || "claude-opus-5",
} as const;

/**
 * USD per million tokens, used to estimate spend for the admin dashboard.
 * Labelled as an estimate everywhere it surfaces, because the real invoice is
 * Anthropic's and these rates change.
 */
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-fable-5-1": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
};

const FALLBACK_PRICE: Price = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Cost in USD micro-cents (1e-8 USD) so it can be summed as an integer.
 * Storing a float here would make the admin cost column drift over millions of
 * rows for the same reason money never lives in a float.
 */
export function estimateCostMicros(model: string, usage: TokenUsage): bigint {
  const price = PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, "")] ?? FALLBACK_PRICE;
  const perToken = (rate: number) => rate / 1_000_000;

  const dollars =
    usage.inputTokens * perToken(price.input) +
    usage.outputTokens * perToken(price.output) +
    usage.cacheReadTokens * perToken(price.cacheRead) +
    usage.cacheWriteTokens * perToken(price.cacheWrite);

  return BigInt(Math.round(dollars * 1e8));
}

export const microsToUsd = (micros: bigint): number => Number(micros) / 1e8;

export function usageFrom(raw: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): TokenUsage {
  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheReadTokens: raw.cache_read_input_tokens ?? 0,
    cacheWriteTokens: raw.cache_creation_input_tokens ?? 0,
  };
}

/** Turn any SDK failure into an AppError with a message worth showing. */
export function toAiError(error: unknown): UpstreamError {
  if (error instanceof Anthropic.RateLimitError) {
    return new UpstreamError("The assistant is busy right now", error);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new UpstreamError("The assistant", error);
  }
  if (error instanceof Anthropic.APIError) {
    return new UpstreamError("The assistant", error);
  }
  return new UpstreamError("The assistant", error);
}

export function errorCodeOf(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "RATE_LIMIT";
  if (error instanceof Anthropic.AuthenticationError) return "AUTH";
  if (error instanceof Anthropic.BadRequestError) return "BAD_REQUEST";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "TIMEOUT";
  if (error instanceof Anthropic.APIError) return `HTTP_${error.status ?? "UNKNOWN"}`;
  return "UNKNOWN";
}

export { Anthropic };
