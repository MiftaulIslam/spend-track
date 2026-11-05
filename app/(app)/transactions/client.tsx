"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { presentAmount } from "@/src/domain/ledger";
import { useEffect, useRef, useState, useTransition } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button, Chip, Input, cn } from "@/src/components/ui";
import { IconSearch } from "@/src/components/icons";
import { Amount } from "@/src/components/money";
import type { TransactionDTO } from "@/src/server/services/transaction-service";

/**
 * Client bits of the ledger.
 *
 * Filters go into the URL and the server re-queries. That keeps the filtered
 * view shareable and reloadable, and — the real reason — means filtering a
 * 200,000-row ledger happens in Postgres rather than by shipping rows to the
 * browser and filtering them there.
 */

function useFilterParams() {
  const router = useRouter();
  const params = useSearchParams();

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.push(`/transactions?${next.toString()}`, { scroll: false });
  }

  return { params, update };
}

export function SearchField({ initial }: { initial: string }) {
  const { update } = useFilterParams();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced, so typing does not fire a query per keystroke.
  useEffect(() => {
    if (value === initial) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(() => update({ search: value || null }));
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <IconSearch
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-tertiary"
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search merchant, description or note…"
        className="pl-9"
        aria-label="Search transactions"
      />
      {pending ? (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-tertiary">…</span>
      ) : null}
    </div>
  );
}

export function FilterChips({
  accounts,
  categories,
}: {
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; label: string }>;
}) {
  const { params, update } = useFilterParams();
  const [open, setOpen] = useState<"account" | "category" | null>(null);

  const type = params.get("type");
  const accountId = params.get("account");
  const categoryId = params.get("category");
  const activeCount = [...params.keys()].filter((k) => k !== "sort").length;

  return (
    <div className="mt-3">
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-2 lg:px-8">
        <Chip selected={!type && !params.get("uncategorised") && !params.get("needsReview")} onClick={() => update({ type: null, uncategorised: null, needsReview: null })}>
          All
        </Chip>
        <Chip selected={type === "EXPENSE"} onClick={() => update({ type: type === "EXPENSE" ? null : "EXPENSE" })}>
          Expenses
        </Chip>
        <Chip selected={type === "INCOME"} onClick={() => update({ type: type === "INCOME" ? null : "INCOME" })}>
          Income
        </Chip>
        <Chip
          selected={params.get("transfers") === "false"}
          onClick={() => update({ transfers: params.get("transfers") === "false" ? null : "false" })}
        >
          Hide transfers
        </Chip>
        <Chip selected={open === "account" || Boolean(accountId)} onClick={() => setOpen(open === "account" ? null : "account")}>
          {accountId ? accounts.find((a) => a.id === accountId)?.name ?? "Account" : "Account"}
        </Chip>
        <Chip selected={open === "category" || Boolean(categoryId)} onClick={() => setOpen(open === "category" ? null : "category")}>
          {categoryId ? categories.find((c) => c.id === categoryId)?.label ?? "Category" : "Category"}
        </Chip>
        <Chip
          selected={params.get("uncategorised") === "true"}
          onClick={() => update({ uncategorised: params.get("uncategorised") === "true" ? null : "true" })}
        >
          Uncategorised
        </Chip>
        <Chip
          selected={params.get("needsReview") === "true"}
          onClick={() => update({ needsReview: params.get("needsReview") === "true" ? null : "true" })}
        >
          Needs review
        </Chip>
        {activeCount > 0 ? (
          <Chip onClick={() => update(Object.fromEntries([...params.keys()].map((k) => [k, null])))}>
            Clear
          </Chip>
        ) : null}
      </div>

      {open ? (
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto border-t border-rule-faint bg-sunken px-4 py-2 lg:px-8">
          {(open === "account" ? accounts : categories).map((item) => {
            const key = open === "account" ? "account" : "category";
            const current = params.get(key);
            const label = "name" in item ? item.name : item.label;
            return (
              <Chip
                key={item.id}
                selected={current === item.id}
                onClick={() => {
                  update({ [key]: current === item.id ? null : item.id });
                  setOpen(null);
                }}
              >
                {label}
              </Chip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cursor pagination with a virtualised tail.
 *
 * The first page is server-rendered so the ledger paints immediately. Once a
 * user pages past a few hundred rows the DOM cost matters, so additional pages
 * are virtualised rather than appended.
 */
export function LoadMore({ cursor }: { cursor: string | null }) {
  const params = useSearchParams();
  const [items, setItems] = useState<TransactionDTO[]>([]);
  const [next, setNext] = useState(cursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!next || loading) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams(params.toString());
      query.set("cursor", next);
      query.set("limit", "50");
      const response = await fetch(`/api/transactions?${query.toString()}`);
      if (!response.ok) throw new Error("request failed");
      const data = (await response.json()) as { items: TransactionDTO[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...data.items]);
      setNext(data.nextCursor);
    } catch {
      setError("Couldn't load more. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {items.length > 0 ? (
        <Virtuoso
          useWindowScroll
          data={items}
          increaseViewportBy={400}
          itemContent={(_, txn) => <VirtualRow txn={txn} />}
        />
      ) : null}

      <div className="flex flex-col items-center gap-2 py-6">
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {next ? (
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Load 50 more"}
          </Button>
        ) : (
          <p className="text-xs text-ink-tertiary">That&rsquo;s everything.</p>
        )}
      </div>
    </>
  );
}

/** A client-side row. Mirrors the server row's grid so nothing jumps. */
function VirtualRow({ txn }: { txn: TransactionDTO }) {
  return (
    <a
      href={`/transactions/${txn.id}`}
      className={cn(
        "grid items-center gap-3 border-b border-rule-faint px-4 py-[11px] transition-colors hover:bg-rule-faint lg:px-8",
        "grid-cols-[34px_minmax(0,1fr)_auto] lg:grid-cols-[30px_minmax(0,1fr)_150px_130px_110px]",
      )}
    >
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-md lg:size-[30px]"
        style={{
          background: `color-mix(in oklab, var(--color-cat-${(((txn.categoryColor ?? 12) - 1) % 12) + 1}) 11%, transparent)`,
        }}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block truncate text-base lg:text-sm">
          {txn.description ?? txn.merchantName ?? txn.typeLabel}
        </span>
        <span className="block truncate text-xs text-ink-tertiary lg:hidden">
          {txn.categoryName ?? "Uncategorised"} · {txn.accountName}
        </span>
      </span>
      <span className="hidden truncate text-xs text-ink-secondary lg:block">
        {txn.categoryName ?? "Uncategorised"}
      </span>
      <span className="hidden truncate text-xs text-ink-secondary lg:block">{txn.accountName}</span>
      <span className="text-right">
        <Amount
          value={txn.amount}
          size="md"
          tone={presentAmount(txn).tone}
          sign={presentAmount(txn).sign}
          className="lg:text-sm"
        />
      </span>
    </a>
  );
}
