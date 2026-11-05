/**
 * Money — integer minor-unit arithmetic.
 *
 * This is the only module in SpendTrack permitted to do arithmetic on an amount.
 * Everything is `bigint` minor units (cents, pence, yen, …) paired with an
 * ISO-4217 code. There is no `number` anywhere in this file's value path, which
 * is what makes balances deterministic: 0.1 + 0.2 can never equal 0.30000000000000004
 * because no float is ever involved.
 *
 * Has no dependencies. Runs in a test without a database.
 */

export type CurrencyCode = string; // ISO-4217 alpha-3, upper case

export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

/**
 * Minor-unit exponents that differ from the default of 2.
 * ISO-4217 defines these; getting them wrong silently multiplies a JPY amount
 * by 100, so they are explicit rather than assumed.
 */
const EXPONENTS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

export function exponentOf(currency: CurrencyCode): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function minorPerUnit(currency: CurrencyCode): bigint {
  return 10n ** BigInt(exponentOf(currency));
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine ${a} with ${b}. Convert first.`);
    this.name = "CurrencyMismatchError";
  }
}

export class InvalidAmountError extends Error {
  constructor(input: unknown) {
    super(`"${String(input)}" is not a valid monetary amount.`);
    this.name = "InvalidAmountError";
  }
}

/* ------------------------------------------------------------ construction */

export function money(minor: bigint | number | string, currency: CurrencyCode): Money {
  const code = currency.toUpperCase();
  if (typeof minor === "bigint") return { minor, currency: code };
  if (typeof minor === "number") {
    if (!Number.isInteger(minor)) throw new InvalidAmountError(minor);
    return { minor: BigInt(minor), currency: code };
  }
  if (!/^-?\d+$/.test(minor)) throw new InvalidAmountError(minor);
  return { minor: BigInt(minor), currency: code };
}

export const zero = (currency: CurrencyCode): Money => money(0n, currency);

/** Which characters this locale uses for grouping and for the decimal point. */
function localeSeparators(locale: string): { group: string; decimal: string } {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    return {
      group: parts.find((p) => p.type === "group")?.value ?? ",",
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    };
  } catch {
    return { group: ",", decimal: "." };
  }
}

export interface ParseOptions {
  /** Used only to break the genuinely ambiguous "1,234" / "1.234" case. */
  locale?: string;
}

/**
 * Parse human input — "1,234.56", "$1234.5", "-12", "1 234,56" — into minor units.
 *
 * `1,234` and `12.345` are textually indistinguishable as grouping-vs-decimal;
 * the only real signals are the currency's own precision and the writer's
 * locale. Resolved in that order, and when both say the string has more
 * fraction digits than the currency supports, this throws rather than rounding —
 * silently turning `12.345` into `12.35` (or `12,345`) loses money either way.
 */
export function parseAmount(input: string, currency: CurrencyCode, opts: ParseOptions = {}): Money {
  const exp = exponentOf(currency);
  const { group: localeGroup, decimal: localeDecimal } = localeSeparators(opts.locale ?? "en-US");

  let s = input.trim().replace(/[\s  ']/g, "");
  if (!s) throw new InvalidAmountError(input);

  // Strip currency symbols and codes, keeping only digits, separators and signs.
  s = s.replace(/[^\d.,\-+()]/g, "");

  // Accounting negatives: (12.34)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;

  let decimalSep = "";
  if (dots > 0 && commas > 0) {
    // Both present: the right-most one is the decimal point. Unambiguous.
    decimalSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  } else if (dots > 1 || commas > 1) {
    // Repeated separator can only be grouping.
    decimalSep = "";
  } else if (dots === 1 || commas === 1) {
    const sep = dots === 1 ? "." : ",";
    const tail = s.slice(s.lastIndexOf(sep) + 1);
    if (tail.length !== 3) {
      decimalSep = sep; // "12.5" or "1234,56" — cannot be a group
    } else if (tail.length <= exp) {
      decimalSep = sep; // KWD "1.234" is one dinar and 234 fils
    } else if (sep === localeGroup) {
      decimalSep = ""; // en-US "1,234" — grouping
    } else if (sep === localeDecimal) {
      // en-US "12.345" — a decimal point with more digits than USD has. Ask.
      throw new InvalidAmountError(
        `${input} — ${currency.toUpperCase()} has ${exp} decimal place${exp === 1 ? "" : "s"}`,
      );
    } else {
      decimalSep = ""; // separator belongs to neither role; treat as grouping
    }
  }

  let whole: string;
  let frac = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    whole = s.slice(0, idx).replace(/[.,]/g, "");
    frac = s.slice(idx + 1).replace(/[.,]/g, "");
  } else {
    whole = s.replace(/[.,]/g, "");
  }

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) throw new InvalidAmountError(input);
  if (whole === "" && frac === "") throw new InvalidAmountError(input);
  if (frac.length > exp) {
    throw new InvalidAmountError(
      `${input} — ${currency.toUpperCase()} has ${exp} decimal place${exp === 1 ? "" : "s"}`,
    );
  }

  const padded = frac.padEnd(exp, "0");
  const minor = BigInt(whole || "0") * minorPerUnit(currency) + BigInt(padded || "0");
  return { minor: negative ? -minor : minor, currency: currency.toUpperCase() };
}

/* -------------------------------------------------------------- arithmetic */

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

export function negate(a: Money): Money {
  return { minor: -a.minor, currency: a.currency };
}

export function abs(a: Money): Money {
  return { minor: a.minor < 0n ? -a.minor : a.minor, currency: a.currency };
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  let total = 0n;
  for (const it of items) {
    if (it.currency !== currency.toUpperCase()) throw new CurrencyMismatchError(currency, it.currency);
    total += it.minor;
  }
  return { minor: total, currency: currency.toUpperCase() };
}

/**
 * Multiply by a rational factor without going through a float.
 * `multiply(m, 7n, 100n)` is 7%. Rounds half-away-from-zero, the convention
 * every financial institution uses for a single terminal rounding step.
 */
export function multiply(a: Money, numerator: bigint, denominator: bigint): Money {
  if (denominator === 0n) throw new InvalidAmountError("division by zero");
  return { minor: divRoundHalfAway(a.minor * numerator, denominator), currency: a.currency };
}

/** Basis points: 250 bps = 2.5%. */
export function percentBps(a: Money, bps: number): Money {
  return multiply(a, BigInt(Math.round(bps)), 10_000n);
}

export function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new InvalidAmountError("division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/**
 * Split an amount into `parts` shares that sum **exactly** back to the original.
 *
 * The naive approach — divide and round each share — loses or invents money:
 * $10.00 over 3 people rounds to 3 × $3.33 = $9.99. Here the remainder cents are
 * handed out one each, largest-remainder style, so the shares always reconcile.
 */
export function allocate(a: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new InvalidAmountError(parts);
  const n = BigInt(parts);
  const base = a.minor / n;
  let remainder = a.minor - base * n; // keeps the sign of `a`
  const step = remainder < 0n ? -1n : 1n;
  const out: Money[] = [];
  for (let i = 0; i < parts; i++) {
    let share = base;
    if (remainder !== 0n) {
      share += step;
      remainder -= step;
    }
    out.push({ minor: share, currency: a.currency });
  }
  return out;
}

/** Allocate by weights (e.g. splitting a bill 50/30/20). Sums exactly. */
export function allocateByRatio(a: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new InvalidAmountError("no weights");
  const w = weights.map((x) => BigInt(Math.round(x * 1_000_000)));
  const total = w.reduce((acc, x) => acc + x, 0n);
  if (total === 0n) throw new InvalidAmountError("weights sum to zero");

  const out: Money[] = [];
  let allocated = 0n;
  for (let i = 0; i < w.length - 1; i++) {
    const share = divRoundHalfAway(a.minor * w[i], total);
    out.push({ minor: share, currency: a.currency });
    allocated += share;
  }
  // The last share absorbs the rounding difference so the total is exact.
  out.push({ minor: a.minor - allocated, currency: a.currency });
  return out;
}

/* ------------------------------------------------------------- comparison */

export const isZero = (a: Money): boolean => a.minor === 0n;
export const isNegative = (a: Money): boolean => a.minor < 0n;
export const isPositive = (a: Money): boolean => a.minor > 0n;

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSame(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export const equals = (a: Money, b: Money): boolean =>
  a.currency === b.currency && a.minor === b.minor;

/* ------------------------------------------------------------ presentation */

/** "1234.56" — a decimal string, never a number. Safe to put in JSON. */
export function toDecimalString(a: Money): string {
  const exp = exponentOf(a.currency);
  const negative = a.minor < 0n;
  const digits = (negative ? -a.minor : a.minor).toString().padStart(exp + 1, "0");
  const whole = digits.slice(0, digits.length - exp) || "0";
  const frac = exp > 0 ? digits.slice(digits.length - exp) : "";
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export interface FormatOptions {
  locale?: string;
  /** "symbol" ($12.34) · "code" (USD 12.34) · "none" (12.34) */
  display?: "symbol" | "code" | "none";
  /** Drop the fraction for round amounts in dense tables. */
  compactFraction?: boolean;
  signDisplay?: "auto" | "always" | "never" | "exceptZero";
}

/**
 * Intl.NumberFormat takes a `number`, which we avoid in arithmetic — but
 * formatting is the end of the line, and every amount a human will read is far
 * inside the safe-integer range. The conversion happens here and nowhere else.
 */
export function format(a: Money, opts: FormatOptions = {}): string {
  const { locale = "en-US", display = "symbol", compactFraction = false, signDisplay = "auto" } = opts;
  const exp = exponentOf(a.currency);
  const value = Number(toDecimalString(a));
  const showFraction = !(compactFraction && a.minor % minorPerUnit(a.currency) === 0n);

  try {
    return new Intl.NumberFormat(locale, {
      style: display === "none" ? "decimal" : "currency",
      currency: display === "none" ? undefined : a.currency,
      currencyDisplay: display === "code" ? "code" : "symbol",
      minimumFractionDigits: showFraction ? exp : 0,
      maximumFractionDigits: showFraction ? exp : 0,
      signDisplay,
    }).format(value);
  } catch {
    // Unknown currency code — still render something useful rather than throwing
    // in the middle of a render tree.
    return `${a.currency} ${toDecimalString(a)}`;
  }
}

/** Splits a formatted amount so the UI can style the fraction separately. */
export function formatParts(
  a: Money,
  opts: FormatOptions = {},
): { sign: string; symbol: string; whole: string; fraction: string } {
  const formatted = format(a, { ...opts, signDisplay: "never" });
  const decimal = new Intl.NumberFormat(opts.locale ?? "en-US")
    .formatToParts(1.1)
    .find((p) => p.type === "decimal")?.value ?? ".";

  const idx = formatted.lastIndexOf(decimal);
  const head = idx >= 0 ? formatted.slice(0, idx) : formatted;
  const fraction = idx >= 0 ? formatted.slice(idx + 1) : "";
  const match = head.match(/^([^\d]*)(.*)$/);
  return {
    sign: a.minor < 0n ? "-" : "",
    symbol: match?.[1]?.trim() ?? "",
    whole: match?.[2] ?? head,
    fraction,
  };
}

/* ------------------------------------------------- serialisation boundary */

export interface MoneyDTO {
  minor: string;
  currency: CurrencyCode;
  decimal: string;
}

/** bigint does not survive JSON.stringify — every amount crosses as a string. */
export const toDTO = (a: Money): MoneyDTO => ({
  minor: a.minor.toString(),
  currency: a.currency,
  decimal: toDecimalString(a),
});

export const fromDTO = (dto: Pick<MoneyDTO, "minor" | "currency">): Money =>
  money(BigInt(dto.minor), dto.currency);
