import type { NextRequest } from "next/server";
import { JOBS, type JobName } from "@/src/server/jobs";
import { errorResponse, ForbiddenError, NotFoundError } from "@/src/server/errors";
import { safeEqual } from "@/src/lib/hash";

/**
 * The job runner endpoint.
 *
 * Jobs are exposed over HTTP so **any** scheduler can drive them — Vercel Cron,
 * a GitHub Action, a container cron, or a person with curl. That keeps the
 * scheduling decision out of the application, which is the part most likely to
 * differ between deployments.
 *
 * Authorised by a shared secret in a header, compared in constant time. It is
 * not a user session: a job acts as the system on behalf of many users.
 */

export const maxDuration = 300;

function authorise(request: NextRequest): void {
  const expected = process.env.JOBS_SECRET;
  if (!expected) {
    throw new ForbiddenError("Job endpoints are disabled because JOBS_SECRET is not set.");
  }

  const provided =
    request.headers.get("x-jobs-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    // Vercel Cron sends its own header; accept it when the secret matches.
    request.nextUrl.searchParams.get("secret") ??
    "";

  if (!provided || !safeEqual(provided, expected)) {
    throw new ForbiddenError("Not authorised to run jobs.");
  }
}

export async function POST(request: NextRequest, context: RouteContext<"/api/jobs/[name]">) {
  try {
    authorise(request);
    const { name } = await context.params;

    if (name === "all") {
      // Run everything in sequence. Used by a single nightly cron in simple
      // deployments; a failure in one job does not stop the others.
      const results = [];
      // Each result carries its own job name, so the key is not needed here.
      for (const job of Object.values(JOBS)) {
        results.push(await job());
      }
      return Response.json({
        ran: results.length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    }

    const job = JOBS[name as JobName];
    if (!job) throw new NotFoundError(`Job "${name}"`);

    const result = await job();
    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET lists the jobs, so a new deployment can discover what to schedule. */
export async function GET(request: NextRequest) {
  try {
    authorise(request);
    const { JOB_SCHEDULE } = await import("@/src/server/jobs");
    return Response.json({
      jobs: Object.keys(JOBS).map((name) => ({
        name,
        schedule: JOB_SCHEDULE[name as JobName],
        endpoint: `/api/jobs/${name}`,
      })),
      runAll: "/api/jobs/all",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
