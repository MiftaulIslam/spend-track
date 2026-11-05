import type { MoneyDTO } from "@/src/domain/money";
import { cn } from "./ui";

/**
 * Money rendering.
 *
 * The fraction is set smaller and dimmer than the whole part. In a column of
 * amounts that makes the magnitude scannable — your eye lands on "1,234" and
 * treats ".56" as detail, which is how people actually read money.
 *
 * Amounts arrive as decimal **strings** (never numbers), so nothing can be lost
 * between the database and the screen.
 */

export interface AmountProps {
  value: MoneyDTO;
  /** "auto" shows a minus for negatives; "always" also shows a plus. */
  sign?: "auto" | "always" | "never" | "explicit-minus";
  /** Colour by money direction rather than by mathematical sign. */
  tone?: "default" | "inflow" | "outflow" | "transfer" | "muted";
  size?: "sm" | "base" | "md" | "lg" | "xl" | "display" | "hero";
  className?: string;
  /** Hide the currency symbol, for dense tables with a column header. */
  bare?: boolean;
}

const SIZE_CLASS: Record<NonNullable<AmountProps["size"]>, string> = {
  sm: "text-sm",
  base: "text-base",
  md: "text-md",
  lg: "text-lg",
  xl: "text-xl",
  display: "text-2xl font-medium tracking-[-0.03em]",
  hero: "text-3xl font-medium tracking-[-0.035em]",
};

const TONE_CLASS: Record<NonNullable<AmountProps["tone"]>, string> = {
  default: "",
  inflow: "text-inflow",
  outflow: "text-outflow",
  transfer: "text-transfer",
  muted: "text-ink-tertiary",
};

/** Symbol for a currency, resolved once per render by Intl. */
function symbolFor(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function Amount({
  value,
  sign = "auto",
  tone = "default",
  size = "base",
  className,
  bare = false,
}: AmountProps) {
  const negative = value.decimal.startsWith("-");
  const [wholeRaw, frac] = value.decimal.replace("-", "").split(".");
  const whole = group(wholeRaw);
  const symbol = symbolFor(value.currency);

  const prefix =
    sign === "never"
      ? ""
      : negative
        ? "−"
        : sign === "always"
          ? "+"
          : sign === "explicit-minus"
            ? "−"
            : "";

  return (
    <span
      className={cn("num", SIZE_CLASS[size], TONE_CLASS[tone], className)}
      title={`${value.decimal} ${value.currency}`}
    >
      {prefix}
      {!bare ? <span className="mr-[0.12em] text-[0.78em] text-ink-tertiary">{symbol}</span> : null}
      {whole}
      {frac ? <span className="text-[0.78em] opacity-65">.{frac}</span> : null}
    </span>
  );
}

/** Plain string form, for aria-labels, titles and exports. */
export function amountText(value: MoneyDTO, options: { sign?: boolean } = {}): string {
  const negative = value.decimal.startsWith("-");
  const [whole, frac] = value.decimal.replace("-", "").split(".");
  const symbol = symbolFor(value.currency);
  const prefix = negative ? "−" : options.sign ? "+" : "";
  return `${prefix}${symbol}${group(whole)}${frac ? `.${frac}` : ""}`;
}

/** Percent, rendered the same way as money so figures line up in a column. */
export function Percent({
  value,
  digits = 1,
  sign = false,
  className,
}: {
  value: number;
  digits?: number;
  sign?: boolean;
  className?: string;
}) {
  const pct = value * 100;
  const prefix = sign && pct > 0 ? "+" : "";
  return (
    <span className={cn("num", className)}>
      {prefix}
      {pct.toFixed(digits)}%
    </span>
  );
}

/** A signed change, coloured by whether it is good news for this metric. */
export function Delta({
  value,
  goodWhen = "down",
  digits = 1,
  className,
}: {
  value: number;
  /** For spending, down is good. For income and savings, up is good. */
  goodWhen?: "up" | "down";
  digits?: number;
  className?: string;
}) {
  const pct = value * 100;
  if (!Number.isFinite(pct)) return <span className={cn("num text-ink-tertiary", className)}>—</span>;

  const good = goodWhen === "up" ? pct >= 0 : pct <= 0;
  return (
    <span className={cn("num", good ? "text-inflow" : "text-outflow", className)}>
      {pct > 0 ? "+" : ""}
      {pct.toFixed(digits)}%
    </span>
  );
}
