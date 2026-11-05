import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { adminAuditLogs, auditLogs, systemEvents } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";

/**
 * Audit logging.
 *
 * Append-only by construction: this module exports no update or delete. Every
 * financial mutation calls `record` inside the same database transaction as the
 * change itself, so an audit row cannot be missing for a write that succeeded.
 */

export interface AuditInput {
  action: string;        // "transaction.update"
  entityType: string;    // "Transaction"
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  ipHash?: string;
  userAgent?: string;
  /** Override the owning user when an admin or system actor writes on their behalf. */
  targetUserId?: string;
}

const ACTOR_TYPE: Record<ActorContext["via"], "USER" | "SYSTEM" | "RULE" | "AI" | "ADMIN" | "IMPORT"> = {
  USER: "USER",
  SYSTEM: "SYSTEM",
  RULE: "RULE",
  AI: "AI",
  ADMIN: "ADMIN",
  IMPORT: "IMPORT",
};

/** JSON-safe snapshot: bigint has no JSON representation and Date is ambiguous. */
export function snapshot(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(snapshot);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = snapshot(v);
    }
    return out;
  }
  return value;
}

/**
 * Keep only the fields that actually changed.
 * A full-row snapshot on every edit makes the activity log unreadable and the
 * table enormous; the diff is what a person is trying to see.
 */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before || !after) {
    return {
      before: before ? (snapshot(before) as Record<string, unknown>) : null,
      after: after ? (snapshot(after) as Record<string, unknown>) : null,
    };
  }

  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const a = snapshot(before[key]);
    const b = snapshot(after[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changedBefore[key] = a;
      changedAfter[key] = b;
    }
  }

  if (Object.keys(changedAfter).length === 0) return { before: null, after: null };
  return { before: changedBefore, after: changedAfter };
}

export async function record(
  actor: ActorContext,
  input: AuditInput,
  db: Db = rootDb,
): Promise<void> {
  const { before, after } = diff(
    (input.before ?? null) as Record<string, unknown> | null,
    (input.after ?? null) as Record<string, unknown> | null,
  );

  // An update that changed nothing is not an event worth recording.
  if (input.action.endsWith(".update") && !after) return;

  await db.insert(auditLogs).values({
    userId: input.targetUserId ?? actor.userId,
    actorType: ACTOR_TYPE[actor.via],
    actorId: actor.userId,
    actorLabel: actor.name ?? actor.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    // `snapshot` has already turned every Date and bigint into a string, so
    // this is jsonb-safe even though TypeScript sees `unknown`.
    before: before ?? null,
    after: after ?? null,
    requestId: input.requestId,
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  actions?: string[];
  cursor?: string;
  limit?: number;
}

export async function list(actor: ActorContext, query: AuditQuery = {}) {
  const limit = Math.min(query.limit ?? 50, 200);
  // Keyset on (createdAt, id): the cursor row's own values bound the next page,
  // so a shared timestamp can neither skip a row nor repeat one.
  const anchor = query.cursor
    ? await rootDb.query.auditLogs.findFirst({
        where: and(eq(auditLogs.id, query.cursor), eq(auditLogs.userId, actor.userId)),
        columns: { createdAt: true, id: true },
      })
    : undefined;

  const rows = await rootDb.query.auditLogs.findMany({
    where: and(
      eq(auditLogs.userId, actor.userId),
      query.entityType ? eq(auditLogs.entityType, query.entityType) : undefined,
      query.entityId ? eq(auditLogs.entityId, query.entityId) : undefined,
      query.action ? eq(auditLogs.action, query.action) : undefined,
      query.actions?.length ? inArray(auditLogs.action, query.actions) : undefined,
      anchor
        ? sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (${anchor.createdAt}, ${anchor.id})`
        : undefined,
    ),
    orderBy: [desc(auditLogs.createdAt), desc(auditLogs.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

/** Admin actions are audited in their own table, which users cannot read. */
export async function recordAdmin(
  adminUserId: string,
  input: {
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    metadata?: unknown;
    ipHash?: string;
    userAgent?: string;
  },
  db: Db = rootDb,
): Promise<void> {
  await db.insert(adminAuditLogs).values({
    adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    metadata: input.metadata ? snapshot(input.metadata) : null,
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });
}

/** Operational telemetry — job runs, errors, upstream failures. */
export async function recordSystemEvent(
  input: {
    kind: "JOB_RUN" | "ERROR" | "AUTH_EVENT" | "RATE_LIMIT" | "UPSTREAM" | "MIGRATION" | "ADMIN_ACTION";
    severity?: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
    source: string;
    message: string;
    fingerprint?: string;
    metadata?: unknown;
    durationMs?: number;
  },
  db: Db = rootDb,
): Promise<void> {
  await db
    .insert(systemEvents)
    .values({
      kind: input.kind,
      severity: input.severity ?? "INFO",
      source: input.source,
      message: input.message.slice(0, 500),
      fingerprint: input.fingerprint ?? `${input.source}:${input.message.slice(0, 80)}`,
      metadata: input.metadata ? snapshot(input.metadata) : null,
      durationMs: input.durationMs,
    })
    // Telemetry must never break the operation it is describing.
    .catch(() => undefined);
}
