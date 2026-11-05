import Link from "next/link";
import { incomeDelta, presentAmount, spendingDelta } from "@/src/domain/ledger";
import { formatLedgerDate, relativeDayLabel } from "@/src/domain/datetime";
import type { ReactNode } from "react";
import { Amount } from "./money";
import { Badge, cn } from "./ui";
import { CategoryIcon } from "./icons";
import type { TransactionDTO } from "@/src/server/services/transaction-service";
import type { MoneyDTO } from "@/src/domain/money";

/**
 * The transaction row.
 *
 * Used on the dashboard, the ledger, account detail and search. A three-column
 * grid on mobile (icon, body, amount) that becomes five on desktop, where the
 * metadata moves out of the subtitle into its own columns — the same data, laid
 * out for the width available rather than shrunk.
 */

export function TransactionRow({
  txn,
  href,
  dense = false,
}: {
  txn: TransactionDTO;
  href?: string;
  dense?: boolean;
}) {
  const { tone, sign } = presentAmount(txn);

  const body = (
    <>
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-md lg:size-[30px]"
        style={{
          color: `var(--color-cat-${((txn.categoryColor ?? 12) - 1) % 12 + 1})`,
          background: `color-mix(in oklab, var(--color-cat-${((txn.categoryColor ?? 12) - 1) % 12 + 1}) 11%, transparent)`,
        }}
        aria-hidden
      >
        <CategoryIcon name={txn.isTransfer ? "repeat" : undefined} size={16} />
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-normal lg:text-sm">
            {txn.description ?? txn.merchantName ?? txn.typeLabel}
          </span>
          {txn.status === "PENDING" ? <Badge tone="warning">pending</Badge> : null}
          {txn.isSplit ? <Badge tone="info">split {txn.splitCount}</Badge> : null}
          {txn.needsReview ? <Badge tone="warning">review</Badge> : null}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-ink-tertiary lg:hidden">
          <span>{txn.categoryName ?? "Uncategorised"}</span>
          <span className="text-ink-disabled">·</span>
          <span>{txn.accountName}</span>
          {!dense ? (
            <>
              <span className="text-ink-disabled">·</span>
              <span className="num">{formatTime(txn.occurredAt)}</span>
            </>
          ) : null}
        </span>
      </span>

      {/* Desktop columns */}
      <span className="hidden truncate text-xs text-ink-secondary lg:block">
        {txn.categoryName ?? "Uncategorised"}
      </span>
      <span className="hidden truncate text-xs text-ink-secondary lg:block">{txn.accountName}</span>

      <span className="text-right">
        <Amount
          value={txn.amount}
          size="md"
          tone={tone}
          sign={sign}
          className={cn("lg:text-sm", txn.status === "PENDING" && "opacity-55")}
        />
        {txn.fx ? (
          <span className="num block text-2xs text-ink-tertiary">
            {txn.amount.currency} @ {Number(txn.fx.rate).toFixed(4)}
          </span>
        ) : null}
      </span>
    </>
  );

  const className = cn(
    "grid items-center gap-3 border-b border-rule-faint px-4 py-[11px] last:border-0",
    "grid-cols-[34px_minmax(0,1fr)_auto]",
    "lg:grid-cols-[30px_minmax(0,1fr)_150px_130px_110px]",
    href && "cursor-pointer transition-colors hover:bg-rule-faint",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Sticky day header with that day's net. */
export function DayHeader({ date, total }: { date: string; total: ReactNode }) {
  return (
    <div className="sticky top-14 z-10 flex items-baseline gap-2 border-b border-rule-faint bg-paper/90 px-4 py-2 backdrop-blur">
      <span className="text-xs font-semibold text-ink-secondary">{date}</span>
      <span className="ml-auto text-xs text-ink-tertiary">{total}</span>
    </div>
  );
}

/** A generic row for lists that are not transactions — bills, subs, goals. */
export function ListRow({
  icon,
  title,
  sub,
  right,
  rightSub,
  href,
  tone = "--color-ink-secondary",
  badge,
}: {
  icon: ReactNode;
  title: ReactNode;
  sub: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  href?: string;
  tone?: string;
  badge?: ReactNode;
}) {
  const body = (
    <>
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-md"
        style={{ color: `var(${tone})`, background: `color-mix(in oklab, var(${tone}) 11%, transparent)` }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base lg:text-sm">{title}</span>
          {badge}
        </span>
        <span className="block truncate text-xs text-ink-tertiary">{sub}</span>
      </span>
      {right ? (
        <span className="shrink-0 text-right">
          <span className="block">{right}</span>
          {rightSub ? <span className="block text-2xs text-ink-tertiary">{rightSub}</span> : null}
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "flex items-center gap-3 border-b border-rule-faint px-4 py-[11px] last:border-0",
    href && "cursor-pointer transition-colors hover:bg-rule-faint",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Group transactions into days, with the day's net spend. */
/**
 * Group a page of transactions into days.
 *
 * `todayKey` comes from the caller because only the server knows the user's
 * timezone. Deriving it here from `new Date()` would label a transaction
 * "Yesterday" to anyone whose evening falls on the next UTC day.
 */
export function groupByDay(
  items: TransactionDTO[],
  todayKey: string,
): Array<{ key: string; label: string; net: MoneyDTO; items: TransactionDTO[] }> {
  const groups = new Map<string, TransactionDTO[]>();
  for (const item of items) {
    const key = item.occurredAt.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, dayItems]) => {
    // income − spending, using the ledger's own deltas rather than re-testing
    // `isSpending`/`isIncome` here. A refund is neither of those, so the
    // hand-rolled version dropped it from the day total entirely: a day with a
    // $270 dinner and a $32.08 refund read as −$270.00 instead of −$237.92.
    // `spendingDelta` knows a reversal subtracts.
    let net = 0n;
    for (const item of dayItems) {
      const minor = BigInt(item.amountBase.minor);
      net += incomeDelta(item.type, minor) - spendingDelta(item.type, minor);
    }
    const currency = dayItems[0]?.amountBase.currency ?? "USD";
    const minor = net < 0n ? -net : net;
    const whole = (minor / 100n).toString();
    const frac = (minor % 100n).toString().padStart(2, "0");

    return {
      key,
      label: dayLabel(key, todayKey),
      net: {
        minor: net.toString(),
        currency,
        decimal: `${net < 0n ? "-" : ""}${whole}.${frac}`,
      },
      items: dayItems,
    };
  });
}

function dayLabel(iso: string, todayKey: string): string {
  const short = formatLedgerDate(`${iso}T00:00:00Z`);
  const relative = relativeDayLabel(iso, todayKey);
  if (relative) return `${relative} · ${short}`;
  return formatLedgerDate(`${iso}T00:00:00Z`, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}
