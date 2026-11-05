import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/src/server/db";
import { rateLimitCounters } from "@/src/server/db/schema";

/**
 * Rate limiting.
 *
 * Database-backed rather than in-memory, because an in-memory counter is per
 * instance — three server processes means three times the intended limit, and a
 * restart resets it. A row per (bucket, window) is cheap and correct.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

/** Fixed windows: simpler than a sliding log and adequate for abuse control. */
export async function consume(bucket: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const windowMs = options.windowSeconds * 1000;
  const windowEnd = new Date(Math.ceil(Date.now() / windowMs) * windowMs);

  try {
    // Upsert-and-increment in one statement, so concurrent requests cannot both
    // read the same count and both decide they are under the limit.
    const rows = await db
      .insert(rateLimitCounters)
      .values({ bucket, windowEnd, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitCounters.bucket, rateLimitCounters.windowEnd],
        set: { count: sql`${rateLimitCounters.count} + 1` },
      })
      .returning({ count: rateLimitCounters.count });
    const count = rows[0]?.count ?? 1;
    const allowed = count <= options.limit;
    return {
      allowed,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((windowEnd.getTime() - Date.now()) / 1000),
      limit: options.limit,
    };
  } catch {
    // If the limiter itself is broken, let the request through rather than
    // taking the product down. The failure is visible in the error stream.
    return { allowed: true, remaining: options.limit, retryAfterSeconds: 0, limit: options.limit };
  }
}

/** Read the current count without consuming — for showing a quota in the UI. */
export async function peek(bucket: string, options: RateLimitOptions): Promise<number> {
  const windowMs = options.windowSeconds * 1000;
  const windowEnd = new Date(Math.ceil(Date.now() / windowMs) * windowMs);
  const row = await db.query.rateLimitCounters.findFirst({
    where: and(eq(rateLimitCounters.bucket, bucket), eq(rateLimitCounters.windowEnd, windowEnd)),
    columns: { count: true },
  });
  return row?.count ?? 0;
}

export async function sweepExpired(): Promise<number> {
  const deleted = await db
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.windowEnd, new Date(Date.now() - 3_600_000)))
    .returning({ id: rateLimitCounters.id });
  return deleted.length;
}
