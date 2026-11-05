import type { NextRequest } from "next/server";
import { requireActor } from "@/src/server/auth/guards";
import { errorResponse } from "@/src/server/errors";
import * as transactionService from "@/src/server/services/transaction-service";
import { createTransactionSchema, transactionFilterSchema } from "@/src/lib/schemas";
import { consume } from "@/src/lib/rate-limit";
import { RateLimitError } from "@/src/server/errors";

/**
 * The transaction list endpoint.
 *
 * Exists because pagination and the command palette need to fetch after the
 * initial render. Everything the page renders on first paint comes from the
 * service directly in a Server Component — no HTTP hop.
 */

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const query = request.nextUrl.searchParams;

    const filter = transactionFilterSchema.parse({
      cursor: query.get("cursor") ?? undefined,
      limit: query.get("limit") ?? undefined,
      search: query.get("search") ?? undefined,
      accountIds: split(query.get("account")),
      categoryIds: split(query.get("category")),
      types: split(query.get("type")),
      dateFrom: query.get("from") ?? undefined,
      dateTo: query.get("to") ?? undefined,
      uncategorised: query.get("uncategorised") === "true" ? true : undefined,
      needsReview: query.get("needsReview") === "true" ? true : undefined,
      includeTransfers: query.get("transfers") !== "false",
      sort: query.get("sort") ?? undefined,
    });

    const page = await transactionService.list(actor, filter);
    return Response.json(page, {
      headers: {
        // Per-user data must never be cached by a shared cache.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();

    const limit = await consume(`txn:create:${actor.userId}`, { limit: 120, windowSeconds: 60 });
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const body = await request.json();
    const parsed = createTransactionSchema.parse(body);
    const created = await transactionService.create(actor, parsed, { createdVia: "API" });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

const split = (value: string | null): string[] | undefined =>
  value ? value.split(",").filter(Boolean) : undefined;
