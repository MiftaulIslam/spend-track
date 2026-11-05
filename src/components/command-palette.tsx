"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, Kbd } from "./ui";
import { Amount } from "./money";
import {
  IconArrowRight,
  IconClose,
  IconFlag,
  IconPlus,
  IconReceipt,
  IconRepeat,
  IconSearch,
  IconSparkle,
  IconStore,
  IconTarget,
  IconUpload,
} from "./icons";
import { NAV_GROUPS } from "./app-shell";
import type { MoneyDTO } from "@/src/domain/money";

/**
 * Command palette (⌘K).
 *
 * Three kinds of result, in order of how often they are what you wanted:
 * actions, then your own transactions (searched server-side, debounced), then
 * navigation. Asking the assistant is the last option rather than the first,
 * because a keystroke-fast local answer beats a two-second one.
 */

interface SearchHit {
  id: string;
  description: string;
  merchantName: string | null;
  categoryName: string | null;
  accountName: string;
  amount: MoneyDTO;
  occurredAt: string;
  isSpending: boolean;
}

/**
 * The shell owns nothing but whether the palette is open.
 *
 * The search state lives one level down, in `Palette`, so closing the palette
 * unmounts it and opening it again starts from nothing. That is the reset — no
 * effect watching `open` to blank the query, which would be a second render
 * pass every time and one more thing to keep in step with the state it clears.
 */
export function CommandPalette({ onQuickAdd }: { onQuickAdd: () => void }) {
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K, plus a custom event so the rail button can open it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("spendtrack:command", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("spendtrack:command", onCustom);
    };
  }, []);

  if (!open) return null;
  return <Palette onClose={() => setOpen(false)} onQuickAdd={onQuickAdd} />;
}

function Palette({ onClose, onQuickAdd }: { onClose: () => void; onQuickAdd: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Below the minimum length there is nothing to show. Derived rather than
  // stored: writing `[]` into state from the effect would render twice, and the
  // stored value could disagree with the query that produced it.
  const visibleHits = query.trim().length < 2 ? [] : hits;

  // Debounced server search. The previous request is aborted so results cannot
  // arrive out of order and overwrite a newer query's results.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/transactions?search=${encodeURIComponent(query)}&limit=6`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { items: SearchHit[] };
        setHits(data.items ?? []);
      } catch {
        // Aborted or offline — leave the previous results alone.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [router, onClose],
  );

  const navItems = useMemo(
    () => NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))),
    [],
  );

  return (
    <>
      <div
        className="animate-fade fixed inset-0 z-60 bg-inverse/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <Command
        label="Command palette"
        loop
        className="animate-modal fixed top-[12vh] left-1/2 z-61 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-clip rounded-lg bg-surface shadow-[var(--shadow-modal)] ring-1 ring-rule"
      >
        <div className="flex h-13 items-center gap-2.5 border-b border-rule px-4">
          <IconSearch size={18} className="text-ink-tertiary" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder="Search transactions or run a command…"
            className="h-13 flex-1 bg-transparent text-md outline-none placeholder:text-ink-disabled"
          />
          {loading ? <span className="text-xs text-ink-tertiary">Searching…</span> : null}
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-sm text-ink-tertiary hover:bg-rule-faint"
            aria-label="Close"
          >
            <IconClose size={16} />
          </button>
        </div>

        <Command.List className="max-h-[54vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-ink-tertiary">
            {query.trim().length < 2
              ? "Type to search your transactions."
              : loading
                ? "Searching…"
                : `Nothing matches “${query}”.`}
          </Command.Empty>

          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
          >
            <Item
              icon={<IconPlus size={16} />}
              onSelect={() => {
                onClose();
                onQuickAdd();
              }}
              hint="N"
            >
              Add a transaction
            </Item>
            <Item
              icon={<IconRepeat size={16} />}
              onSelect={() => go("/transactions/new?type=transfer")}
            >
              Record a transfer
            </Item>
            <Item icon={<IconReceipt size={16} />} onSelect={() => go("/receipts")}>
              Capture a receipt
            </Item>
            <Item icon={<IconUpload size={16} />} onSelect={() => go("/import")}>
              Import a statement
            </Item>
            <Item icon={<IconTarget size={16} />} onSelect={() => go("/budgets/new")}>
              Create a budget
            </Item>
            <Item icon={<IconFlag size={16} />} onSelect={() => go("/goals/new")}>
              Create a goal
            </Item>
          </Command.Group>

          {visibleHits.length > 0 ? (
            <Command.Group
              heading="Transactions"
              className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"
            >
              {visibleHits.map((hit) => (
                <Item
                  key={hit.id}
                  icon={<IconStore size={16} />}
                  onSelect={() => go(`/transactions/${hit.id}`)}
                  value={`txn-${hit.id}-${hit.description}`}
                >
                  <span className="min-w-0 flex-1 truncate">{hit.description}</span>
                  <span className="shrink-0 text-xs text-ink-tertiary">
                    {hit.categoryName ?? "Uncategorised"} · {hit.occurredAt.slice(0, 10)}
                  </span>
                  <Amount
                    value={hit.amount}
                    size="sm"
                    tone={hit.isSpending ? "default" : "inflow"}
                    className="shrink-0"
                  />
                </Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group
            heading="Go to"
            className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"
          >
            {navItems.map(({ href, label, Icon, group }) => (
              <Item
                key={href}
                icon={<Icon size={16} />}
                onSelect={() => go(href)}
                value={`nav-${label}-${group}`}
              >
                <span className="flex-1">{label}</span>
                <span className="text-xs text-ink-tertiary">{group}</span>
              </Item>
            ))}
          </Command.Group>

          {query.trim().length > 2 ? (
            <Command.Group
              heading="Ask the assistant"
              className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"
            >
              <Item
                icon={<IconSparkle size={16} />}
                onSelect={() => go(`/assistant?q=${encodeURIComponent(query)}`)}
                value={`ask-${query}`}
              >
                <span className="flex-1 truncate">“{query}”</span>
                <IconArrowRight size={14} className="text-ink-tertiary" />
              </Item>
            </Command.Group>
          ) : null}
        </Command.List>

        <div className="flex items-center gap-3 border-t border-rule bg-sunken px-4 py-2 text-2xs text-ink-tertiary">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </Command>
    </>
  );
}

function Item({
  icon,
  children,
  onSelect,
  hint,
  value,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
  hint?: string;
  value?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={value}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm",
        "data-[selected=true]:bg-sunken",
        "[&_svg]:shrink-0 [&_svg]:text-ink-tertiary",
      )}
    >
      {icon}
      {children}
      {hint ? <Kbd>{hint}</Kbd> : null}
    </Command.Item>
  );
}
