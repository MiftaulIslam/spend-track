/**
 * Currency conversion.
 *
 * Rates are decimal strings (Postgres `numeric`), never floats. Conversion
 * scales to a fixed-point integer, multiplies, then rounds **once** at the end.
 * Rounding at intermediate steps is how conversion chains drift.
 */

import {
  type CurrencyCode,
  type Money,
  divRoundHalfAway,
  exponentOf,
  minorPerUnit,
} from "./money";

/** Internal fixed-point scale for rates: 12 decimal places, matching the column. */
const RATE_SCALE = 12;
const RATE_UNIT = 10n ** BigInt(RATE_SCALE);

export class MissingRateError extends Error {
  constructor(
    readonly base: CurrencyCode,
    readonly quote: CurrencyCode,
    readonly asOf?: Date,
  ) {
    super(
      `No exchange rate for ${base}→${quote}${asOf ? ` on ${asOf.toISOString().slice(0, 10)}` : ""}.`,
    );
    this.name = "MissingRateError";
  }
}

/** Parse "1.0821" or "0.006771" into scaled integer form. */
export function parseRate(rate: string | number | bigint): bigint {
  if (typeof rate === "bigint") return rate * RATE_UNIT;
  const s = String(rate).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid exchange rate: ${rate}`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > RATE_SCALE) {
    // Extra precision is truncated deliberately: the column stores 12 dp, so
    // keeping more here would produce results the database cannot reproduce.
    return BigInt(whole + frac.slice(0, RATE_SCALE));
  }
  return BigInt(whole + frac.padEnd(RATE_SCALE, "0"));
}

export function rateToString(scaled: bigint): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(RATE_SCALE + 1, "0");
  const whole = digits.slice(0, digits.length - RATE_SCALE);
  const frac = digits.slice(digits.length - RATE_SCALE).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export interface RateLookup {
  /** 1 unit of `base` = rate units of `quote`, as a decimal string. */
  (base: CurrencyCode, quote: CurrencyCode): string | null;
}

/**
 * Convert `amount` into `target`.
 *
 * Handles the minor-unit exponent difference between currencies: 1 USD (2 dp)
 * to JPY (0 dp) must not leave two phantom decimal places behind.
 */
export function convert(amount: Money, target: CurrencyCode, rate: string | bigint): Money {
  const to = target.toUpperCase();
  if (amount.currency === to) return amount;

  const scaledRate = typeof rate === "bigint" ? rate : parseRate(rate);
  const fromUnit = minorPerUnit(amount.currency);
  const toUnit = minorPerUnit(to);

  // amount.minor / fromUnit * rate * toUnit, as one fraction with a single
  // terminal rounding step.
  const numerator = amount.minor * scaledRate * toUnit;
  const denominator = RATE_UNIT * fromUnit;
  return { minor: divRoundHalfAway(numerator, denominator), currency: to };
}

/**
 * Resolve a rate between any two currencies, triangulating through the pivot
 * (usually the rate provider's base) when a direct pair is not stored.
 */
export function resolveRate(
  from: CurrencyCode,
  to: CurrencyCode,
  lookup: RateLookup,
  pivot: CurrencyCode = "USD",
): bigint {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return RATE_UNIT;

  const direct = lookup(a, b);
  if (direct) return parseRate(direct);

  const inverse = lookup(b, a);
  if (inverse) {
    const inv = parseRate(inverse);
    if (inv === 0n) throw new MissingRateError(a, b);
    return divRoundHalfAway(RATE_UNIT * RATE_UNIT, inv);
  }

  // Triangulate: a → pivot → b.
  const aToPivot = a === pivot ? RATE_UNIT : tryRate(a, pivot, lookup);
  const pivotToB = b === pivot ? RATE_UNIT : tryRate(pivot, b, lookup);
  if (aToPivot === null || pivotToB === null) throw new MissingRateError(a, b);

  return divRoundHalfAway(aToPivot * pivotToB, RATE_UNIT);
}

function tryRate(x: CurrencyCode, y: CurrencyCode, lookup: RateLookup): bigint | null {
  const direct = lookup(x, y);
  if (direct) return parseRate(direct);
  const inverse = lookup(y, x);
  if (inverse) {
    const inv = parseRate(inverse);
    return inv === 0n ? null : divRoundHalfAway(RATE_UNIT * RATE_UNIT, inv);
  }
  return null;
}

/** How many decimal places a displayed rate deserves for this pair. */
export function displayRatePrecision(from: CurrencyCode, to: CurrencyCode): number {
  const spread = exponentOf(from) - exponentOf(to);
  return Math.max(2, 4 + spread);
}

export { RATE_UNIT, RATE_SCALE };
