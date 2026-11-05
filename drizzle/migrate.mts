import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Apply pending migrations.
 *
 * Runs the migrator directly rather than through `drizzle-kit migrate` so the
 * connection is the same pooled client the app uses — which matters against a
 * managed Postgres where the CLI's own connection settings differ.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  const started = Date.now();
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log(`migrations applied in ${Date.now() - started}ms`);

  await pool.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
