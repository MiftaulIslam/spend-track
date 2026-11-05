import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import {
  Badge,
  Callout,
  EmptyState,
  Meter,
  Panel,
  PanelBody,
  PanelHead,
  SectionHead,
  Stat,
  StatGrid,
} from "@/src/components/ui";
import { IconInfo, IconTarget } from "@/src/components/icons";
import * as savingsTargetService from "@/src/server/services/savings-target-service";
import * as accountService from "@/src/server/services/account-service";
import { formatLedgerDate } from "@/src/domain/datetime";
import { PlannerPanel, DepositButton } from "./client";

export const metadata = { title: "Targets" };

/**
 * Savings targets.
 *
 * The page leads with the planner rather than the list, because the first thing
 * anyone does here is ask a question — "the bike is ₹5,00,000, how long?" — and
 * only then decides whether to keep the answer. A list of existing targets sits
 * underneath for the ones they kept.
 */

const VERDICT_TONE = {
  COMPLETE: "inflow",
  COMFORTABLE: "inflow",
  TIGHT: "warning",
  BEYOND_MEANS: "danger",
  STALLED: "neutral",
} as const;

const VERDICT_LABEL = {
  COMPLETE: "Funded",
  COMFORTABLE: "Affordable",
  TIGHT: "Tight",
  BEYOND_MEANS: "Beyond your surplus",
  STALLED: "No contribution set",
} as const;

export default async function TargetsPage() {
  const actor = await requireUserPage("/targets");
  const [targets, accounts, surplus] = await Promise.all([
    savingsTargetService.list(actor, { includeCompleted: true }),
    accountService.list(actor),
    savingsTargetService.monthlySurplus(actor),
  ]);

  const open = targets.filter((t) => t.status !== "COMPLETED");
  const funded = targets.filter((t) => t.status === "COMPLETED");

  const committedMonthly = open.reduce(
    (acc, t) => acc + BigInt(t.monthlyEquivalent.minor),
    0n,
  );

  return (
    <>
      <AppBar
        title="Targets"
        sub="Work out what something costs you per month, and when you get it"
      />

      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <StatGrid cols={3}>
            <Stat
              label="Spare each month"
              value={<Amount value={surplus} size="lg" bare />}
              delta={<span className="text-ink-tertiary">median of the last 6 months</span>}
            />
            <Stat
              label="Already committed"
              value={
                <Amount
                  value={{
                    minor: committedMonthly.toString(),
                    currency: surplus.currency,
                    decimal: (Number(committedMonthly) / 100).toFixed(2),
                  }}
                  size="lg"
                  bare
                />
              }
              delta={
                <span className="text-ink-tertiary">
                  {open.length} active {open.length === 1 ? "target" : "targets"}
                </span>
              }
            />
            <Stat
              label="Still free"
              value={
                <Amount
                  value={{
                    minor: (BigInt(surplus.minor) - committedMonthly).toString(),
                    currency: surplus.currency,
                    decimal: (
                      (Number(surplus.minor) - Number(committedMonthly)) /
                      100
                    ).toFixed(2),
                  }}
                  size="lg"
                  bare
                />
              }
              delta={<span className="text-ink-tertiary">after existing targets</span>}
            />
          </StatGrid>

          {/* The planner is the point of the page, so it comes first. */}
          <PlannerPanel
            currency={actor.baseCurrency}
            accounts={accounts
              .filter((a) => !a.archivedAt)
              .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          />

          {open.length > 0 ? (
            <section className="mt-8">
              <SectionHead title="Saving for" />
              <div className="grid gap-4 md:grid-cols-2">
                {open.map((t) => (
                  <Panel key={t.id}>
                    <PanelHead
                      title={t.name}
                      action={
                        <Badge tone={VERDICT_TONE[t.verdict]}>{VERDICT_LABEL[t.verdict]}</Badge>
                      }
                    />
                    <PanelBody>
                      <div className="flex items-baseline justify-between gap-3">
                        <Amount value={t.saved} size="lg" bare />
                        <span className="num text-xs text-ink-tertiary">
                          of <Amount value={t.price} size="sm" bare /> ·{" "}
                          {Math.round(t.fraction * 100)}%
                        </span>
                      </div>

                      <Meter
                        value={t.fraction}
                        tone={t.verdict === "BEYOND_MEANS" ? "warn" : "ok"}
                        className="mt-3"
                        label={`${t.name} progress`}
                      />

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <dt className="text-ink-tertiary">Left to save</dt>
                          <dd className="num mt-0.5">
                            <Amount value={t.remaining} size="sm" bare />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-tertiary">Per month</dt>
                          <dd className="num mt-0.5">
                            <Amount value={t.monthlyEquivalent} size="sm" bare />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-tertiary">Ready</dt>
                          <dd className="mt-0.5">
                            {t.completionDate ? formatLedgerDate(t.completionDate, {
                              month: "short",
                              year: "numeric",
                            }) : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-tertiary">Final deposit</dt>
                          <dd className="num mt-0.5">
                            <Amount value={t.finalDeposit} size="sm" bare />
                          </dd>
                        </div>
                      </dl>

                      <p className="mt-4 text-xs text-ink-secondary">{t.summary}</p>

                      {t.verdict === "BEYOND_MEANS" && BigInt(t.monthlyShortfall.minor) > 0n ? (
                        <Callout tone="warning" icon={<IconInfo size={16} />} className="mt-3">
                          <Amount value={t.monthlyShortfall} size="sm" bare /> a month more than
                          you usually have spare. The date will slip unless something else gives.
                        </Callout>
                      ) : null}

                      <div className="mt-4 flex items-center gap-2">
                        <DepositButton
                          targetId={t.id}
                          targetName={t.name}
                          currency={t.price.currency}
                          suggested={t.contribution?.decimal ?? t.remaining.decimal}
                          remaining={t.remaining.decimal}
                          accounts={accounts
                            .filter((a) => !a.archivedAt && a.id !== t.linkedAccountId)
                            .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
                        />
                        <Link
                          href={`/goals`}
                          className="text-xs text-ink-tertiary underline underline-offset-2"
                        >
                          Open as goal
                        </Link>
                      </div>
                    </PanelBody>
                  </Panel>
                ))}
              </div>
            </section>
          ) : (
            <section className="mt-8">
              <Panel>
                <EmptyState
                  icon={<IconTarget size={20} />}
                  title="Nothing saved for yet"
                  body="Price something above and keep the plan if the timing works."
                />
              </Panel>
            </section>
          )}

          {funded.length > 0 ? (
            <section className="mt-8 mb-10">
              <SectionHead title="Funded" />
              <Panel>
                {funded.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                    <Amount value={t.price} size="sm" bare />
                    <Badge tone="inflow">Funded</Badge>
                  </div>
                ))}
              </Panel>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}
