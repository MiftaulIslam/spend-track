"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Sheet, SheetBody, SheetContent, SheetFoot } from "./sheet";
import { Button, Chip, Dot, Field, Input, Select, Textarea, cn } from "./ui";
import { IconBackspace, IconCheck, IconSparkle } from "./icons";
import { toast } from "./toaster";
import { createTransactionAction, createTransferAction, parsePhraseAction } from "@/src/app-actions/transactions";

/**
 * Quick add — the most-used surface in the product.
 *
 * The target is three taps: amount, category, save. Everything else is behind
 * "More details". The keypad is custom rather than a native number input
 * because the native keyboard on iOS covers the amount you are typing, and
 * because a decimal point that sometimes produces a comma is unusable for money.
 */

export interface QuickAddAccount {
  id: string;
  name: string;
  currency: string;
  type: string;
  mask: string | null;
}

export interface QuickAddCategory {
  id: string;
  label: string;
  name: string;
  colorIndex: number;
  kind: string;
}

type Direction = "EXPENSE" | "INCOME" | "TRANSFER";

interface QuickAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: QuickAddAccount[];
  categories: QuickAddCategory[];
  recentCategoryIds: string[];
  /**
   * Today, as `YYYY-MM-DD`, in the user's configured timezone.
   *
   * Passed in rather than read from the browser clock. `new Date()` here answers
   * "what day is it where this code is running", which is the server's zone
   * during SSR and the device's afterwards — neither is the zone the user set,
   * and both are a day out for part of every day.
   */
  today: string;
}

/**
 * The sheet. It owns no form state at all.
 *
 * The form is keyed on `open`, so each opening mounts a new one and every field
 * starts empty. That is the reset — a cancelled entry cannot bleed into the
 * next one. The alternative, an effect that blanks seven fields whenever `open`
 * flips, costs an extra render on every open and has to be kept in step by hand
 * each time the form grows a field.
 */
export function QuickAdd({ open, onOpenChange, ...data }: QuickAddProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="New transaction">
        <QuickAddForm key={open ? "open" : "closed"} onOpenChange={onOpenChange} {...data} />
      </SheetContent>
    </Sheet>
  );
}

function QuickAddForm({
  onOpenChange,
  accounts,
  categories,
  recentCategoryIds,
  today,
}: Omit<QuickAddProps, "open">) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [direction, setDirection] = useState<Direction>("EXPENSE");
  const [digits, setDigits] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [showMore, setShowMore] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [parsing, setParsing] = useState(false);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const currency = account?.currency ?? "USD";

  // Categories matching the current direction, most-recently-used first.
  const suggested = useMemo(() => {
    const wanted = direction === "INCOME" ? "INCOME" : "EXPENSE";
    const matching = categories.filter((c) => c.kind === wanted);
    const recent = recentCategoryIds
      .map((id) => matching.find((c) => c.id === id))
      .filter((c): c is QuickAddCategory => Boolean(c));
    const rest = matching.filter((c) => !recentCategoryIds.includes(c.id));
    return [...recent, ...rest].slice(0, 6);
  }, [categories, direction, recentCategoryIds]);

  const amount = formatDigits(digits);
  const canSave = digits.length > 0 && Number(amount) > 0 && Boolean(accountId);

  function press(key: string) {
    setDigits((prev) => {
      if (key === "back") return prev.slice(0, -1);
      if (key === "." ) return prev; // the pad is minor-unit based; see formatDigits
      if (prev.length >= 9) return prev;
      if (prev === "" && key === "0") return prev;
      return prev + key;
    });
  }

  function save(andAnother = false) {
    if (!canSave) return;
    startTransition(async () => {
      const result =
        direction === "TRANSFER"
          ? await createTransferAction({
              fromAccountId: accountId,
              toAccountId,
              amount,
              occurredAt: date,
              note: note || undefined,
            })
          : await createTransactionAction({
              accountId,
              type: direction,
              amount,
              occurredAt: date,
              categoryId: categoryId ?? undefined,
              merchantName: merchant || undefined,
              description: merchant || undefined,
              note: note || undefined,
            });

      if (!result.ok) {
        toast.error(result.error?.message ?? "That didn't save.");
        return;
      }

      toast.success(
        direction === "TRANSFER" ? "Transfer recorded" : `${direction === "INCOME" ? "Income" : "Expense"} saved`,
        {
          action: {
            label: "Undo",
            onClick: async () => {
              const id = (result.data as { id?: string; outTransactionId?: string })?.id
                ?? (result.data as { outTransactionId?: string })?.outTransactionId;
              if (!id) return;
              const { undoTransactionAction } = await import("@/src/app-actions/transactions");
              const undone = await undoTransactionAction(id);
              if (undone.ok) {
                toast("Removed");
                router.refresh();
              }
            },
          },
        },
      );

      router.refresh();
      if (andAnother) {
        setDigits("");
        setMerchant("");
        setNote("");
      } else {
        onOpenChange(false);
      }
    });
  }

  /** Natural language: "12 lunch at Pret on the Amex yesterday". */
  async function interpret() {
    if (!phrase.trim()) return;
    setParsing(true);
    try {
      const result = await parsePhraseAction(phrase);
      if (!result.ok || !result.data) {
        toast.error("Couldn't read that — try adding an amount.");
        return;
      }
      const parsed = result.data;
      if (!parsed.understood) {
        toast(parsed.clarification ?? "Add an amount and try again.");
        return;
      }
      if (parsed.amount) setDigits(String(Math.round(Number(parsed.amount) * 100)));
      if (parsed.type) setDirection(parsed.type as Direction);
      if (parsed.merchant) setMerchant(parsed.merchant);
      if (parsed.note) setNote(parsed.note);
      if (parsed.date) setDate(parsed.date);
      if (parsed.accountHint) {
        const match = accounts.find((a) =>
          a.name.toLowerCase().includes(parsed.accountHint!.toLowerCase()),
        );
        if (match) setAccountId(match.id);
      }
      if (parsed.categorySlug) {
        const match = categories.find((c) => c.name.toLowerCase() === parsed.categorySlug!.replace(/-/g, " "));
        if (match) setCategoryId(match.id);
      }
      setPhrase("");
      toast.success("Filled in — check it before saving");
    } finally {
      setParsing(false);
    }
  }

  return (
    <>
        <SheetBody>
          {/* ------------------------------------------------ amount pad */}
          <div className="flex flex-col items-center gap-2 pt-6 pb-4">
            <div className="flex gap-0.5 rounded-md bg-sunken p-[3px]" role="group" aria-label="Direction">
              {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={direction === d}
                  onClick={() => {
                    setDirection(d);
                    setCategoryId(null);
                  }}
                  className={cn(
                    "rounded-sm px-3.5 py-1.5 text-xs font-semibold transition-colors",
                    direction === d ? "bg-surface text-ink shadow-raised" : "text-ink-tertiary",
                  )}
                >
                  {d === "EXPENSE" ? "Expense" : d === "INCOME" ? "Income" : "Transfer"}
                </button>
              ))}
            </div>

            <div
              className="num flex items-baseline gap-1 text-[clamp(2.5rem,13vw,3.5rem)] leading-none font-medium tracking-[-0.04em]"
              aria-live="polite"
              aria-label={`Amount ${amount} ${currency}`}
            >
              <span className="text-[0.42em] font-medium text-ink-tertiary">{symbolOf(currency)}</span>
              <AmountDisplay digits={digits} />
              <span className="animate-caret h-[0.82em] w-0.5 rounded-px bg-brass" aria-hidden />
            </div>

            <span className="text-xs text-ink-tertiary">
              {account ? `${account.name} · ${currency}` : "No accounts yet"}
            </span>
          </div>

          {/* ------------------------------------------------- category */}
          {direction !== "TRANSFER" ? (
            <div className="px-4 pb-3">
              <div className="eyebrow mb-2">Category</div>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((c) => (
                  <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                    <Dot index={c.colorIndex} />
                    {c.name}
                  </Chip>
                ))}
                <Chip onClick={() => setShowMore(true)}>More…</Chip>
              </div>
            </div>
          ) : null}

          {/* -------------------------------------------------- account */}
          <div className="px-4 pb-3">
            <div className="eyebrow mb-2">{direction === "TRANSFER" ? "From" : "Account"}</div>
            <div className="flex flex-wrap gap-1.5">
              {accounts.slice(0, 4).map((a) => (
                <Chip key={a.id} selected={accountId === a.id} onClick={() => setAccountId(a.id)}>
                  {a.name}
                  {a.mask ? <span className="text-ink-tertiary">···{a.mask}</span> : null}
                </Chip>
              ))}
            </div>
          </div>

          {direction === "TRANSFER" ? (
            <div className="px-4 pb-3">
              <div className="eyebrow mb-2">To</div>
              <div className="flex flex-wrap gap-1.5">
                {accounts
                  .filter((a) => a.id !== accountId)
                  .slice(0, 4)
                  .map((a) => (
                    <Chip key={a.id} selected={toAccountId === a.id} onClick={() => setToAccountId(a.id)}>
                      {a.name}
                    </Chip>
                  ))}
              </div>
            </div>
          ) : null}

          {/* --------------------------------------------- more details */}
          <details
            className="border-t border-rule px-4 py-3"
            open={showMore}
            onToggle={(e) => setShowMore((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-sm font-medium text-ink-secondary">More details</summary>
            <div className="mt-3 flex flex-col gap-3">
              {direction !== "TRANSFER" ? (
                <>
                  <Field label="Merchant">
                    <Input
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      placeholder="Where was this?"
                    />
                  </Field>
                  <Field label="Category">
                    <Select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value || null)}>
                      <option value="">No category</option>
                      {categories
                        .filter((c) => c.kind === (direction === "INCOME" ? "INCOME" : "EXPENSE"))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </>
              ) : null}
              <Field label="Account">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <Input type="date" className="num" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Note">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
              </Field>

              <Field label="Describe it instead" hint="e.g. “12 lunch at Pret on the Amex yesterday”">
                <div className="flex gap-2">
                  <Input
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void interpret();
                      }
                    }}
                    placeholder="Type it in plain English"
                  />
                  <Button type="button" size="md" onClick={() => void interpret()} disabled={parsing || !phrase.trim()}>
                    <IconSparkle size={16} />
                    {parsing ? "Reading…" : "Fill"}
                  </Button>
                </div>
              </Field>
            </div>
          </details>

          {/* ----------------------------------------------------- keypad */}
          <div className="grid grid-cols-3 gap-px border-t border-rule bg-rule-faint sm:hidden">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key === "back" ? "back" : key)}
                aria-label={key === "back" ? "Delete last digit" : key}
                className="num grid h-[58px] place-items-center bg-paper text-lg font-medium transition-colors active:bg-sunken [font-feature-settings:'zero'_0] [-webkit-tap-highlight-color:transparent]"
              >
                {key === "back" ? <IconBackspace size={20} /> : key}
              </button>
            ))}
          </div>

          {/* Desktop gets a normal field — a keypad with a real keyboard is worse. */}
          <div className="hidden px-4 pb-4 sm:block">
            <Field label="Amount">
              <Input
                autoFocus
                inputMode="decimal"
                className="num text-lg"
                value={amount}
                onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
                placeholder="0.00"
              />
            </Field>
          </div>
        </SheetBody>

        <SheetFoot>
          <Button variant="primary" size="lg" block disabled={!canSave || pending} onClick={() => save(false)}>
            {pending ? (
              "Saving…"
            ) : (
              <>
                <IconCheck size={18} />
                Save {direction === "TRANSFER" ? "transfer" : direction === "INCOME" ? "income" : "expense"} ·{" "}
                {symbolOf(currency)}
                {amount}
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-ink-tertiary">
            Saves to {account?.name ?? "—"}.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => save(true)}
              disabled={!canSave || pending}
            >
              Save and add another
            </button>
          </p>
        </SheetFoot>
    </>
  );
}

/** Digits are entered as minor units, so "1250" reads as 12.50. */
function formatDigits(digits: string): string {
  if (!digits) return "0.00";
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(-2);
  return `${whole}.${frac}`;
}

function AmountDisplay({ digits }: { digits: string }) {
  const value = formatDigits(digits);
  const [whole, frac] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const empty = digits.length === 0;
  return (
    <>
      <span className={empty ? "text-ink-disabled" : undefined}>{grouped}</span>
      <span className={digits.length > 2 ? "opacity-50" : "text-ink-disabled"}>.{frac}</span>
    </>
  );
}

function symbolOf(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}
