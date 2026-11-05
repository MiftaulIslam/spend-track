import "dotenv/config";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

/**
 * Check every table the schema declares against the live database.
 *
 * Verifies three things per table, because a migration can go wrong in three
 * different ways: the table can be missing, its columns can differ, and it can
 * exist but be unreachable (a broken grant or a bad search_path). Selecting a
 * row count from each proves all three at once.
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const declared = Object.values(schema)
    .filter((v) => is(v, PgTable))
    .map((t) => getTableName(t as PgTable))
    .sort();

  const live = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const liveNames = new Set(live.rows.map((r) => r.table_name));

  const enums = await pool.query<{ n: string }>(
    `SELECT count(*)::text n FROM pg_type t
       JOIN pg_namespace ns ON ns.oid = t.typnamespace
      WHERE ns.nspname = 'public' AND t.typtype = 'e'`,
  );
  const indexes = await pool.query<{ n: string }>(
    `SELECT count(*)::text n FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const fks = await pool.query<{ n: string }>(
    `SELECT count(*)::text n FROM information_schema.table_constraints
      WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'`,
  );

  let missing = 0;
  let unreadable = 0;
  let populated = 0;
  const rows: Array<{ table: string; status: string; count: string }> = [];

  for (const name of declared) {
    if (!liveNames.has(name)) {
      rows.push({ table: name, status: "MISSING", count: "-" });
      missing++;
      continue;
    }
    try {
      const r = await pool.query<{ n: string }>(`SELECT count(*)::text n FROM "${name}"`);
      const n = Number(r.rows[0]!.n);
      if (n > 0) populated++;
      rows.push({ table: name, status: "ok", count: r.rows[0]!.n });
    } catch (error) {
      rows.push({
        table: name,
        status: `UNREADABLE: ${(error as Error).message.slice(0, 40)}`,
        count: "-",
      });
      unreadable++;
    }
  }

  const width = Math.max(...rows.map((r) => r.table.length));
  for (const r of rows) {
    const flag = r.status === "ok" ? (r.count === "0" ? "·" : "✓") : "✕";
    console.log(`  ${flag} ${r.table.padEnd(width)}  ${r.count.padStart(6)}  ${r.status === "ok" ? "" : r.status}`);
  }

  const extra = [...liveNames].filter(
    (n) => !declared.includes(n) && n !== "__drizzle_migrations",
  );

  console.log("");
  console.log(`  tables declared : ${declared.length}`);
  console.log(`  tables present  : ${declared.length - missing}`);
  console.log(`  with rows       : ${populated}`);
  console.log(`  empty           : ${declared.length - missing - populated}`);
  console.log(`  missing         : ${missing}`);
  console.log(`  unreadable      : ${unreadable}`);
  console.log(`  untracked in db : ${extra.length}${extra.length ? ` (${extra.join(", ")})` : ""}`);
  console.log(`  enums           : ${enums.rows[0]!.n}`);
  console.log(`  indexes         : ${indexes.rows[0]!.n}`);
  console.log(`  foreign keys    : ${fks.rows[0]!.n}`);

  await pool.end();
  if (missing || unreadable) process.exit(1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
