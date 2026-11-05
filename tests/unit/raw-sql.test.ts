import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A static guard over the hand-written SQL.
 *
 * `$queryRaw<T>` is an *assertion*, not a validation: the generic is a promise
 * to the compiler that nothing checks at runtime. So the one mistake this file
 * exists to catch is invisible to `tsc` and to every read path.
 *
 * Postgres widens `SUM(bigint)` to `numeric` — a sum of int8 values can
 * overflow int8, so the planner picks a type that cannot. The driver then hands
 * back a `Decimal`, the declared `bigint` is a lie, and the lie survives all the
 * way to the first write, where the value is rejected. That is a long way
 * from the typo that caused it, which is exactly why it is worth a test.
 *
 * Verified against the live adapter: SUM(bigint) → Decimal, SUM(...)::bigint →
 * BigInt, COUNT(*) → BigInt, MAX(bigint) → BigInt.
 */

// Resolved from this file, not the working directory: the runner's cwd is
// not guaranteed, and a bad root would make every case below pass vacuously.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOTS = [join(REPO, "src", "server"), join(REPO, "drizzle")];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith(".ts")) yield path;
  }
}

/**
 * Collapse to one line so two-line expressions match, with comments removed
 * first — this very file explains the hazard in prose that mentions SUM(,
 * and a scanner that reads its own documentation as code is worse than none.
 */
const LINE_COMMENT = new RegExp(String.raw`(^|[^:])//[^\n]*`, "g");
const BLOCK_COMMENT = new RegExp(String.raw`/\*[\s\S]*?\*/`, "g");

function flatten(source: string): string {
  return source
    .replace(BLOCK_COMMENT, " ")
    .replace(LINE_COMMENT, "$1 ")
    .replace(/\s+/g, " ");
}

describe("raw SQL type safety", () => {
  // Uppercase SUM( is SQL text. Drizzle's own `sum()` helper is lowercase and
  // already returns a string, so its callers convert explicitly — matching it
  // here would flag correct code.
  const files = ROOTS.flatMap((root) => [...walk(root)]).filter((path) =>
    /SUM\s*\(/.test(flatten(readFileSync(path, "utf8"))),
  );

  it("finds the files that contain raw SQL", () => {
    // If this drops to zero the walk is broken and the rest of the file passes
    // vacuously — which would be worse than no test at all.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s casts every SUM() back to bigint", (path) => {
    const flat = flatten(readFileSync(path, "utf8"));

    // A cast can wrap the whole output expression rather than the SUM itself —
    //   (COALESCE(SUM(a) FILTER (…), 0) - COALESCE(SUM(b) FILTER (…), 0))::bigint
    // — so the property worth asserting is not "the token after SUM is a cast"
    // but "the column this SUM feeds is cast". The window from the SUM to the
    // end of its output item is where that cast has to appear: `AS <alias>`
    // closes an aliased column, `FROM` closes an unaliased one.
    //
    // This is a guard, not a proof: two SUMs in one expression legitimately
    // share a single trailing cast, and an unaliased SUM's window is wide. It
    // exists to catch the omission, which is the failure that actually happened.
    const offenders: string[] = [];
    const pattern = /SUM\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(flat)) !== null) {
      const tail = flat.slice(match.index);
      const end = /\bAS\s+\w|\bFROM\b/i.exec(tail);
      const column = end ? tail.slice(0, end.index) : tail;
      if (!/::\s*(bigint|int|integer|numeric)/i.test(column)) {
        offenders.push(column.slice(0, 120));
      }
    }

    expect(offenders, `uncast SUM() in ${path}`).toEqual([]);
  });
});
