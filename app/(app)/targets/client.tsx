"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Badge,
  Button,
  Callout,
  Field,
  Input,
  Meter,
  Panel,
  PanelBody,
  PanelHead,
  Select,
} from "@/src/components/ui";
import { Sheet, SheetBody, SheetContent, SheetFoot } from "@/src/components/sheet";
import { Amount } from "@/src/components/money";
import { IconInfo } from "@/src/components/icons";
import { toast } from "@/src/components/toaster";
import {
  createSavingsTargetAction,
  depositToTargetAction,
  previewSavingsPlanAction,
} from "@/src/app-actions/planning";
import { formatLedgerDate } from "@/src/domain/datetime";

type Preview = NonNullable<
  Awaited<ReturnType<typeof previewSavingsPlanAction>>["data"]
>;

const VERDICT_TONE = {
  COMPLETE: "inflow",
  COMFORTABLE: "inflow",
  TIGHT: "warning",
  BEYOND_MEANS: "danger",
  STALLED: "neutral",
} as const;

const VERDICT_LABEL = {
  COMPLETE: "Already funded",
  COMFORTABLE: "Affordable",
  TIGHT: "Tight",
  BEYOND_MEANS: "Beyond your surplus",
  STALLED: "Set a contribution",
} as const;

/**
 * The planner.
 *
 * Every figure comes back from the server. The temptation is to divide price by
 * contribution in the browser and show a number instantly, but then two
 * different implementations of the same arithmetic exist — and the one people
 * read would be the one without tests. The round trip is debounced instead.
 */
export function PlannerPanel({
  currency,
  accounts,
}: {
  currency: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saved, setSaved] = useState("");
  const [contribution, setContribution] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [plan, setPlan] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Whether there is enough to plan with is derived, not stored: clearing the
  // plan from inside the effect would render twice on every keystroke that
  // empties a field.
  const ready = price.trim().length > 0 && contribution.trim().length > 0;
  const visiblePlan = ready ? plan : null;
  const visibleError = ready ? error : null;

  // Debounced so typing a five-digit price is one request, not five.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      const result = await previewSavingsPlanAction({
        price,
        saved: saved || undefined,
        contribution,
        frequency,
        currency,
      });
      if (!result.ok) {
        setPlan(null);
        setError(result.error?.message ?? "That does not look like an amount.");
        return;
      }
      setError(null);
      setPlan(result.data ?? null);
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, price, saved, contribution, frequency, currency]);

  function commit() {
    startTransition(async () => {
      const result = await createSavingsTargetAction({
        name: name.trim() || "Savings target",
        price,
        contribution,
        frequency,
        currency,
        linkedAccountId: linkedAccountId || null,
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't save that.");
        return;
      }
      toast.success(`${name.trim() || "Target"} saved`, {
        description: result.data?.summary,
      });
      setName("");
      setPrice("");
      setSaved("");
      setContribution("");
      setPlan(null);
      router.refresh();
    });
  }

  return (
    <Panel className="mt-6">
      <PanelHead
        title="What do you want, and what can you put aside?"
        action={
          visiblePlan ? (
            <Badge tone={VERDICT_TONE[visiblePlan.verdict]}>
              {VERDICT_LABEL[visiblePlan.verdict]}
            </Badge>
          ) : null
        }
      />
      <PanelBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="What is it">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A bike"
              maxLength={80}
            />
          </Field>
          <Field label={`Price (${currency})`}>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="500000"
            />
          </Field>
          <Field label="Saving each period" hint="What you can realistically put aside">
            <Input
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              inputMode="decimal"
              placeholder="20000"
            />
          </Field>
          <Field label="How often">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Fortnightly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </Select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Already put aside" hint="Optional">
            <Input
              value={saved}
              onChange={(e) => setSaved(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </Field>
          <Field label="Save into" hint="Deposits become a real transfer into this account">
            <Select
              value={linkedAccountId}
              onChange={(e) => setLinkedAccountId(e.target.value)}
            >
              <option value="">Track only, don&apos;t move money</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {visibleError ? (
          <Callout tone="danger" icon={<IconInfo size={16} />} className="mt-4">
            {visibleError}
          </Callout>
        ) : null}

        {visiblePlan ? (
          <div className="mt-5 rounded-lg border border-rule bg-sunken/40 p-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <span className="eyebrow">Ready in</span>
                <p className="num text-xl font-medium tracking-[-0.025em]">
                  {visiblePlan.monthsRemaining === null
                    ? "—"
                    : visiblePlan.monthsRemaining === 1
                      ? "1 month"
                      : `${visiblePlan.monthsRemaining} months`}
                </p>
              </div>
              <div>
                <span className="eyebrow">That is</span>
                <p className="text-sm">
                  {visiblePlan.completionDate
                    ? formatLedgerDate(visiblePlan.completionDate, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "never, at this rate"}
                </p>
              </div>
              <div>
                <span className="eyebrow">Per month</span>
                <p className="num text-sm">
                  <Amount value={visiblePlan.monthlyEquivalent} size="sm" bare />
                </p>
              </div>
              <div>
                <span className="eyebrow">Final deposit</span>
                <p className="num text-sm">
                  <Amount value={visiblePlan.finalDeposit} size="sm" bare />
                </p>
              </div>
            </div>

            <Meter
              value={0}
              tone={visiblePlan.verdict === "BEYOND_MEANS" ? "over" : "ok"}
              className="mt-4"
              label="Plan progress"
            />

            <p className="mt-3 text-sm text-ink-secondary">{visiblePlan.summary}</p>

            {/* The check only this app can make. */}
            {BigInt(visiblePlan.monthlyShortfall.minor) > 0n ? (
              <Callout tone="warning" icon={<IconInfo size={16} />} className="mt-3">
                You usually have <Amount value={visiblePlan.surplus} size="sm" bare /> spare each month.
                This plan wants <Amount value={visiblePlan.monthlyEquivalent} size="sm" bare />, which is{" "}
                <Amount value={visiblePlan.monthlyShortfall} size="sm" bare /> more than that.
              </Callout>
            ) : (
              <p className="mt-2 text-xs text-ink-tertiary">
                You usually have <Amount value={visiblePlan.surplus} size="sm" bare /> spare each month.
              </p>
            )}

            {visiblePlan.toFinishSooner && visiblePlan.monthsRemaining && visiblePlan.monthsRemaining > 6 ? (
              <p className="mt-2 text-xs text-ink-tertiary">
                Put aside <Amount value={visiblePlan.toFinishSooner} size="sm" bare /> instead and it
                arrives six months sooner.
              </p>
            ) : null}

            {visiblePlan.schedule.length > 0 ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-ink-tertiary">
                  Show the first {visiblePlan.schedule.length} deposits
                </summary>
                <ul className="mt-2 divide-y divide-rule-faint">
                  {visiblePlan.schedule.map((row) => (
                    <li
                      key={row.index}
                      className="flex items-center justify-between gap-3 py-1.5 text-xs"
                    >
                      <span className="text-ink-tertiary">
                        {formatLedgerDate(row.on, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="num">
                        <Amount value={row.amount} size="sm" bare />
                      </span>
                      <span className="num text-ink-tertiary">
                        <Amount value={row.runningTotal} size="sm" bare />
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="mt-4">
              <Button onClick={commit} disabled={pending || visiblePlan.verdict === "STALLED"}>
                {pending ? "Saving…" : "Keep this plan"}
              </Button>
            </div>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/**
 * Put money into a target.
 *
 * The remaining amount is offered as a shortcut because the last deposit is
 * almost never a round contribution, and typing it by hand is where people
 * overshoot.
 */
export function DepositButton({
  targetId,
  targetName,
  currency,
  suggested,
  remaining,
  accounts,
}: {
  targetId: string;
  targetName: string;
  currency: string;
  suggested: string;
  remaining: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Deposit
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title={`Deposit to ${targetName}`}>
          <DepositForm
            key={open ? "open" : "closed"}
            targetId={targetId}
            targetName={targetName}
            currency={currency}
            suggested={suggested}
            remaining={remaining}
            accounts={accounts}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function DepositForm({
  targetId,
  targetName,
  currency,
  suggested,
  remaining,
  accounts,
  onDone,
}: {
  targetId: string;
  targetName: string;
  currency: string;
  suggested: string;
  remaining: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(suggested);
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await depositToTargetAction({
        targetId,
        amount,
        fromAccountId: fromAccountId || undefined,
        occurredAt: new Date().toISOString(),
        note: note || undefined,
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't record that.");
        return;
      }
      if (result.data?.completed) {
        toast.success(`${targetName} is fully funded`);
      } else {
        toast.success(`Deposited. ${result.data?.remaining} to go.`);
      }
      onDone();
    });
  }

  return (
    <>
      <SheetBody>
        <Field label={`Amount (${currency})`}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <button
          type="button"
          className="mt-1 text-xs text-ink-tertiary underline underline-offset-2"
          onClick={() => setAmount(remaining)}
        >
          Finish it — {remaining}
        </button>

        <Field label="From" className="mt-4" hint="Leave blank to record without moving money">
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            <option value="">Don&apos;t move money</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note" className="mt-4">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </SheetBody>
      <SheetFoot>
        <Button onClick={submit} disabled={pending} block>
          {pending ? "Saving…" : "Deposit"}
        </Button>
      </SheetFoot>
    </>
  );
}
