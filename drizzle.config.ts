import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit — migrations and introspection.
 *
 * The schema and its relations are separate modules: the tables and their
 * constraints in one, the join descriptions the relational query API uses in
 * the other. Both are listed so a migration sees the whole picture.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/db/schema.ts", "./src/server/db/relations.ts"],
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: "camelCase",
  verbose: true,
  strict: true,
});
