"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button } from "@/src/components/ui";
import { Amount } from "@/src/components/money";
import { toast } from "@/src/components/toaster";
import { createRecurringAction, setRecurringStatusAction } from "@/src/app-actions/planning";
import type { MoneyDTO } from "@/src/domain/money";

export function PauseResumeButton({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    startTransition(async () => {
      const result = await setRecurringStatusAction(id, next);
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't update that.");
        return;
      }
      toast.success(next === "PAUSED" ? `${name} paused` : `${name} resumed`, {
        description:
          next === "PAUSED"
            ? "No new occurrences will be created until you resume it."
            : "Occurrences resume from the next due date.",
      });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="ghost" className="shrink-0" disabled={pending} onClick={toggle}>
      {pending ? "…" : status === "ACTIVE" ? "Pause" : "Resume"}
    </Button>
  );
}

/**
 * A detected pattern, offered as a one-tap schedule.
 *
 * The numbers shown are the detector's: the median gap and the mean amount over
 * the matching charges. Accepting creates a real schedule with those values,
 * which the user can then edit like any other.
 */
export function SuggestionRow({
  suggestion,
  currency,
}: {
  suggestion: {
    merchantId: string;
    merchantName: string;
    occurrences: number;
    medianGapDays: number;
    frequency: string;
    amount: MoneyDTO;
    accountId: string;
    categoryId: string | null;
    lastSeen: string;
  };
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function accept() {
    startTransition(async () => {
      const result = await createRecurringAction({
        name: suggestion.merchantName,
        type: "EXPENSE",
        accountId: suggestion.accountId,
        categoryId: suggestion.categoryId ?? undefined,
        amountMode: "FIXED",
        amount: suggestion.amount.decimal,
        currency,
        frequency: suggestion.frequency,
        interval: 1,
        byMonthDay:
          suggestion.frequency === "MONTHLY"
            ? new Date(suggestion.lastSeen).getUTCDate()
            : undefined,
        startsOn: suggestion.lastSeen,
        autoCreate: true,
        reminder: true,
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't create that schedule.");
        return;
      }
      toast.success(`${suggestion.merchantName} schedule created`);
      setDismissed(true);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-base lg:text-sm">{suggestion.merchantName}</span>
          <Badge tone="brass">{titleCase(suggestion.frequency)}</Badge>
        </span>
        <span className="block truncate text-xs text-ink-tertiary">
          {suggestion.occurrences} charges, about every {suggestion.medianGapDays} days · last seen{" "}
          {new Date(suggestion.lastSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
        </span>
      </span>
      <Amount value={suggestion.amount} size="sm" className="shrink-0" sign="never" />
      <Button size="sm" variant="primary" className="shrink-0" disabled={pending} onClick={accept}>
        {pending ? "…" : "Set up"}
      </Button>
      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setDismissed(true)}>
        Dismiss
      </Button>
    </div>
  );
}

const titleCase = (s: string): string =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
