import { sql } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { exchangeRates } from "@/src/server/db/schema";
import { type Money, money } from "@/src/domain/money";
import { RATE_UNIT, convert, rateToString, resolveRate } from "@/src/domain/fx";
import { startOfUtcDay } from "@/src/domain/schedule";

/**
 * Exchange rates.
 *
 * Conversions always use the rate **on the transaction date**, not today's.
 * Using today's rate makes last year's report change every time you open it,
 * which is the wrong answer for anything a person might file taxes against.
 */

const PIVOT = "USD";

interface RateRow {
  base: string;
  quote: string;
  rate: string;
  asOf: Date;
}

/**
 * Per-request memo. A dashboard converts hundreds of amounts, almost all on a
 * handful of distinct dates; without this, each one is a query.
 */
type RateCache = Map<string, RateRow[]>;
const cacheKey = (date: Date) => date.toISOString().slice(0, 10);

export interface FxContext {
  baseCurrency: string;
  cache: RateCache;
  staleDates: Set<string>;
}

export function createFxContext(baseCurrency: string): FxContext {
  return { baseCurrency, cache: new Map(), staleDates: new Set() };
}

/**
 * Load every rate at or before `on`, one row per pair (the most recent).
 * `DISTINCT ON` is a Postgres feature that does this in one index scan rather
 * than a correlated subquery per pair.
 */
async function loadRatesFor(on: Date, db: Db = rootDb): Promise<RateRow[]> {
  const day = startOfUtcDay(on);
  const result = await db.execute<{ base: string; quote: string; rate: string; asOf: Date }>(sql`
    SELECT DISTINCT ON (base, quote) base, quote, rate::text AS rate, "asOf"
    FROM exchange_rates
    WHERE "asOf" <= ${day}
    ORDER BY base, quote, "asOf" DESC
  `);
  return result.rows.map((r) => ({
    ...r,
    asOf: r.asOf instanceof Date ? r.asOf : new Date(String(r.asOf)),
  }));
}

async function ratesFor(ctx: FxContext, on: Date, db: Db = rootDb): Promise<RateRow[]> {
  const key = cacheKey(startOfUtcDay(on));
  const cached = ctx.cache.get(key);
  if (cached) return cached;

  const rows = await loadRatesFor(on, db);
  ctx.cache.set(key, rows);

  // Flag staleness so the UI can mark a converted figure rather than pretend.
  const day = startOfUtcDay(on);
  const freshest = rows.reduce<Date | null>(
    (acc, r) => (!acc || r.asOf > acc ? r.asOf : acc),
    null,
  );
  if (!freshest || day.getTime() - freshest.getTime() > 2 * 86_400_000) {
    ctx.staleDates.add(key);
  }
  return rows;
}

export async function rateOn(
  ctx: FxContext,
  from: string,
  to: string,
  on: Date,
  db: Db = rootDb,
): Promise<bigint> {
  if (from === to) return RATE_UNIT;
  const rows = await ratesFor(ctx, on, db);
  const lookup = (base: string, quote: string) =>
    rows.find((r) => r.base === base && r.quote === quote)?.rate ?? null;
  return resolveRate(from, to, lookup, PIVOT);
}

/** Convert an amount into the actor's base currency at the transaction-date rate. */
export async function toBase(
  ctx: FxContext,
  amount: Money,
  on: Date,
  db: Db = rootDb,
): Promise<{ amount: Money; rate: bigint; stale: boolean }> {
  if (amount.currency === ctx.baseCurrency) {
    return { amount, rate: RATE_UNIT, stale: false };
  }
  const rate = await rateOn(ctx, amount.currency, ctx.baseCurrency, on, db);
  return {
    amount: convert(amount, ctx.baseCurrency, rate),
    rate,
    stale: ctx.staleDates.has(cacheKey(startOfUtcDay(on))),
  };
}

export async function convertOn(
  ctx: FxContext,
  amount: Money,
  target: string,
  on: Date,
  db: Db = rootDb,
): Promise<Money> {
  if (amount.currency === target) return amount;
  const rate = await rateOn(ctx, amount.currency, target, on, db);
  return convert(amount, target, rate);
}

export const formatRate = rateToString;

/* ----------------------------------------------------------------- syncing */

interface RateProviderResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Fetch today's rates. The provider is pivot-based (everything quoted against
 * USD), so only N rows are stored per day and any cross-rate is triangulated at
 * read time. Storing the full N² matrix would be 28,000 rows a day for no gain.
 */
export async function syncRates(
  options: { date?: Date; db?: Db } = {},
): Promise<{ inserted: number; asOf: Date }> {
  const db = options.db ?? rootDb;
  const asOf = startOfUtcDay(options.date ?? new Date());
  const iso = asOf.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.app/${iso}?from=${PIVOT}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Exchange rate provider returned ${response.status}`);
  }

  const payload = (await response.json()) as RateProviderResponse;
  const effective = startOfUtcDay(new Date(payload.date));

  const rows = Object.entries(payload.rates).map(([quote, rate]) => ({
    base: PIVOT,
    quote,
    rate: rate.toFixed(12),
    asOf: effective,
    source: "frankfurter",
  }));

  // The unique index on (base, quote, asOf) makes re-running the job a no-op.
  const inserted = await db
    .insert(exchangeRates)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: exchangeRates.id });
  return { inserted: inserted.length, asOf: effective };
}

/** Rates used on the settings screen and to flag staleness in the UI. */
export async function latestRates(
  baseCurrency: string,
  quotes: string[],
  db: Db = rootDb,
): Promise<Array<{ quote: string; rate: string; asOf: Date; stale: boolean }>> {
  const ctx = createFxContext(baseCurrency);
  const now = new Date();
  const out: Array<{ quote: string; rate: string; asOf: Date; stale: boolean }> = [];

  const rows = await ratesFor(ctx, now, db);
  const freshest = rows.reduce<Date | null>((acc, r) => (!acc || r.asOf > acc ? r.asOf : acc), null);

  for (const quote of quotes) {
    if (quote === baseCurrency) continue;
    try {
      const rate = await rateOn(ctx, baseCurrency, quote, now, db);
      out.push({
        quote,
        rate: rateToString(rate),
        asOf: freshest ?? now,
        stale: ctx.staleDates.has(cacheKey(startOfUtcDay(now))),
      });
    } catch {
      // A pair we have no path for is simply not listed.
    }
  }
  return out;
}

export { money };
