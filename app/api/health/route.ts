import { healthcheck } from "@/src/server/db";
import { aiConfigured } from "@/src/server/ai/client";

/**
 * Health check.
 *
 * Deliberately anonymous and minimal: it reports whether the process can reach
 * the database and nothing about the data. A health endpoint that leaks row
 * counts or version strings is a reconnaissance gift.
 */
export async function GET() {
  const db = await healthcheck();

  return Response.json(
    {
      status: db.ok ? "ok" : "degraded",
      database: { ok: db.ok, latencyMs: db.latencyMs },
      assistant: aiConfigured() ? "configured" : "not configured",
      time: new Date().toISOString(),
    },
    { status: db.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
