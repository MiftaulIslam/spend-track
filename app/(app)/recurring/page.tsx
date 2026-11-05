import Link from "next/link";
import { presentAmount, semanticsOf, type TransactionType } from "@/src/domain/ledger";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import {
  Badge, Callout, EmptyState, LinkButton, Panel, SectionHead, Stat, StatGrid,
} from "@/src/components/ui";
import { IconInfo, IconPlus, IconRotate, IconSparkle } from "@/src/components/icons";
import * as recurringService from "@/src/server/services/recurring-service";
import { PauseResumeButton, SuggestionRow } from "./client";

export const metadata = { title: "Recurring" };

/**
 * Recurring schedules.
 *
 * Detected patterns are offered at the top: the detector is statistical, not
 * AI — three or more charges at a consistent interval and a similar amount —
 * so a suggestion is something the data supports rather than something a model
 * guessed.
 */
export default async function RecurringPage() {
  const actor = await requireUserPage("/recurring");
  const [schedules, suggestions] = await Promise.all([
    recurringService.list(actor),
    recurringService.detectPatterns(actor),
  ]);

  const active = schedules.filter((s) => s.status === "ACTIVE");
  const paused = schedules.filter((s) => s.status === "PAUSED");
  const managed = active.filter((s) => s.managedBy);
  const own = active.filter((s) => !s.managedBy);

  const monthlyOut = own
    .filter((s) => s.type === "EXPENSE" || s.type === "FEE")
    .reduce((acc, s) => acc + BigInt((s.amount ?? s.estimatedAmount)?.minor ?? "0"), 0n);
  const monthlyIn = own
    .filter((s) => s.type === "INCOME")
    .reduce((acc, s) => acc + BigInt((s.amount ?? s.estimatedAmount)?.minor ?? "0"), 0n);

  if (schedules.length === 0 && suggestions.length === 0) {
    return (
      <>
        <AppBar
          title="Recurring"
          actions={
            <LinkButton href="/recurring/new" variant="primary" size="sm">
              <IconPlus size={15} /> Schedule
            </LinkButton>
          }
        />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconRotate />}
                title="No schedules yet"
                body="Set up anything that repeats — salary, rent, a cleaner. Occurrences appear as pending transactions a couple of days ahead so you can adjust before they post."
                action={
                  <LinkButton href="/recurring/new" variant="primary" size="sm">
                    Create a schedule
                  </LinkButton>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="Recurring"
        sub={`${active.length} active${paused.length ? ` · ${paused.length} paused` : ""}`}
        actions={
          <LinkButton href="/recurring/new" variant="primary" size="sm">
            <IconPlus size={15} /> Schedule
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <div className="mt-4">
            <StatGrid>
              <Stat
                label="Recurring out"
                value={<Amount value={money(monthlyOut, actor.baseCurrency)} size="lg" bare />}
                delta="per cycle"
              />
              <Stat
                label="Recurring in"
                value={<Amount value={money(monthlyIn, actor.baseCurrency)} size="lg" tone="inflow" bare />}
                delta="per cycle"
              />
              <Stat label="Schedules" value={<span className="num">{active.length}</span>} />
              <Stat
                label="Detected"
                value={<span className="num">{suggestions.length}</span>}
                delta={suggestions.length ? "not yet set up" : "none pending"}
              />
            </StatGrid>
          </div>

          {suggestions.length > 0 ? (
            <section className="mt-6">
              <Callout tone="brass" icon={<IconSparkle />} className="mb-3">
                Found {suggestions.length} repeating {suggestions.length === 1 ? "pattern" : "patterns"} in
                your history — three or more charges at a consistent interval and a similar amount.
                Nothing is created until you say so.
              </Callout>
              <Panel className="border-brass/30">
                {suggestions.slice(0, 6).map((s) => (
                  <SuggestionRow key={s.merchantId} suggestion={s} currency={actor.baseCurrency} />
                ))}
              </Panel>
            </section>
          ) : null}

          <section className="mt-6">
            <SectionHead title="Your schedules" meta={`${own.length}`} />
            <Panel>
              {own.length === 0 ? (
                <EmptyState
                  title="No standalone schedules"
                  body="Your bills and subscriptions have their own schedules — they're listed below."
                />
              ) : (
                own.map((schedule) => <Row key={schedule.id} schedule={schedule} />)
              )}
            </Panel>
          </section>

          {managed.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Behind bills and subscriptions" meta={`${managed.length}`} />
              <Panel className="opacity-85">
                {managed.map((schedule) => (
                  <Row key={schedule.id} schedule={schedule} />
                ))}
              </Panel>
              <p className="mt-2 px-1 text-xs text-ink-tertiary">
                These are the schedules that drive your bills and subscriptions. Edit them from
                those pages so the two stay in step.
              </p>
            </section>
          ) : null}

          {paused.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Paused" meta={`${paused.length}`} />
              <Panel className="opacity-70">
                {paused.map((schedule) => (
                  <Row key={schedule.id} schedule={schedule} />
                ))}
              </Panel>
            </section>
          ) : null}

          <Callout tone="info" icon={<IconInfo />} className="mt-6">
            Occurrences are created {own[0]?.autoCreate ? "automatically " : ""}as{" "}
            <b>pending</b> transactions a couple of days before they are due, so you can adjust or
            skip one before it affects a balance. A monthly schedule on the 31st stays on the 31st —
            February clamps to the last day and March goes back to the 31st.
          </Callout>
        </div>
      </main>
    </>
  );
}

function Row({ schedule }: { schedule: recurringService.RecurringDTO }) {
  const amount = schedule.amount ?? schedule.estimatedAmount;
  const isIncome = schedule.type === "INCOME";
  const isTransfer = schedule.toAccountId !== null;
  // A schedule has no ledger row yet, so its direction comes from what its
  // type will mean once it posts.
  const { tone, sign } = presentAmount({
    direction: semanticsOf(schedule.type as TransactionType).direction,
    isIncome,
    isTransfer,
  });

  return (
    <div className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-md"
        style={{
          color: isIncome ? "var(--color-inflow)" : "var(--color-cat-4)",
          background: `color-mix(in oklab, ${isIncome ? "var(--color-inflow)" : "var(--color-cat-4)"} 11%, transparent)`,
        }}
        aria-hidden
      >
        <IconRotate size={16} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-base lg:text-sm">{schedule.name}</span>
          {schedule.amountMode === "VARIABLE" ? <Badge>variable</Badge> : null}
          {schedule.managedBy ? (
            <Badge tone="info">{schedule.managedBy.kind}</Badge>
          ) : null}
          {!schedule.autoCreate ? <Badge>manual</Badge> : null}
        </span>
        <span className="block truncate text-xs text-ink-tertiary">
          {schedule.cadence} · {schedule.accountName}
          {schedule.categoryName ? ` · ${schedule.categoryName}` : ""}
          {schedule.nextDueOn ? ` · next ${formatDate(schedule.nextDueOn)}` : ""}
        </span>
      </span>

      <span className="shrink-0 text-right">
        {amount ? (
          <Amount
            value={amount}
            size="md"
            tone={tone}
            sign={sign}
          />
        ) : (
          <span className="text-xs text-ink-tertiary">no estimate yet</span>
        )}
        <span className="block text-2xs text-ink-tertiary">
          {schedule.amountMode === "VARIABLE" ? "estimated" : "fixed"}
        </span>
      </span>

      {!schedule.managedBy ? (
        <PauseResumeButton
          id={schedule.id}
          name={schedule.name}
          status={schedule.status as "ACTIVE" | "PAUSED" | "ENDED"}
        />
      ) : (
        <Link
          href={schedule.managedBy.kind === "bill" ? "/bills" : "/subscriptions"}
          className="shrink-0 text-xs text-ink-tertiary underline underline-offset-2"
        >
          Manage
        </Link>
      )}
    </div>
  );
}

function money(minor: bigint, currency: string) {
  return {
    minor: minor.toString(),
    currency,
    decimal: `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`,
  };
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
