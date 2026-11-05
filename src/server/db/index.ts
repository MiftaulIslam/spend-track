import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";
import * as relations from "./relations";

/**
 * The database handle.
 *
 * Next.js hot-reloads modules in development, so the pool is stashed on
 * `globalThis` — otherwise every save opens a fresh one and Postgres runs out
 * of connections within a minute of editing.
 */

const fullSchema = { ...schema, ...relations };

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: NodePgDatabase<typeof fullSchema>;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your database.",
    );
  }

  return new Pool({
    connectionString,
    // Serverless gets a small pool per instance; a long-lived server can hold more.
    max: process.env.VERCEL ? 1 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db: NodePgDatabase<typeof fullSchema> =
  globalForDb.db ??
  drizzle(pool, {
    schema: fullSchema,
    casing: "camelCase",
    logger: process.env.DB_LOG === "query",
  });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;

/**
 * The type every service and repository accepts.
 *
 * A transaction handle and the root handle are different types in Drizzle, and
 * both must be usable, because a service does not know — and must not care —
 * whether it was called inside a transaction.
 */
export type Db = NodePgDatabase<typeof fullSchema>;

/**
 * Run `fn` inside a database transaction, or reuse an existing one.
 *
 * Financial writes nest: `TransferService` calls `TransactionService` twice and
 * both must land or neither. Passing the transactional handle down and letting
 * this function detect it is what keeps the inner service unaware of whether it
 * is the outermost caller.
 *
 * Detection is by a private marker rather than a duck-typed method: in Drizzle a
 * transaction handle carries the same API surface as the root handle, so there
 * is nothing to feature-test for. Nesting `transaction()` would open a
 * SAVEPOINT — correct in isolation, but it would let an inner service half-commit
 * relative to its caller, which is exactly what this wrapper exists to prevent.
 */
const IN_TRANSACTION = Symbol.for("spendtrack.inTransaction");

type MaybeMarked = { [IN_TRANSACTION]?: true };

export async function withTransaction<T>(
  db: Db,
  fn: (tx: Db) => Promise<T>,
  options?: {
    isolationLevel?: "read committed" | "repeatable read" | "serializable";
  },
): Promise<T> {
  if ((db as MaybeMarked)[IN_TRANSACTION]) return fn(db);

  return db.transaction(
    async (tx) => {
      Object.defineProperty(tx, IN_TRANSACTION, { value: true, enumerable: false });
      return fn(tx as unknown as Db);
    },
    { isolationLevel: options?.isolationLevel ?? "read committed" },
  );
}

export async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Close the pool. For scripts and tests; the server keeps it open. */
export async function closeDb(): Promise<void> {
  await pool.end();
}

export * as schema from "./schema";
export { sql } from "drizzle-orm";
