import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount, Percent } from "@/src/components/money";
import { BarSeries } from "@/src/components/charts";
import {
  Badge,
  Callout,
  Dot,
  EmptyState,
  LinkButton,
  Meter,
  Panel,
  PanelBody,
  PanelHead,
  SectionHead,
  Stat,
  StatGrid,
} from "@/src/components/ui";
import { IconAlert, IconCheck, IconPlus, IconTarget } from "@/src/components/icons";
import * as budgetService from "@/src/server/services/budget-service";
import * as analyticsService from "@/src/server/services/analytics-service";

export const metadata = { title: "Budgets" };

/**
 * Budgets.
 *
 * The page is organised by urgency: what is over, what is heading over, then
 * everything else. The pace marker on each bar is the point of the whole
 * surface — a percentage on its own cannot tell you whether to worry.
 */
export default async function BudgetsPage() {
  const actor = await requireUserPage("/budgets");
  const budgets = await budgetService.list(actor);

  if (budgets.length === 0) {
    const suggestions = await budgetService.suggestFromHistory(actor, { months: 3 });
    return (
      <>
        <AppBar
          title="Budgets"
          actions={
            <LinkButton href="/budgets/new" variant="primary" size="sm">
              <IconPlus size={15} /> Budget
            </LinkButton>
          }
        />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconTarget />}
                title="No budgets yet"
                body="Budgets work best when they start from what you actually spend. Here's what your last three months suggest."
                action={
                  <LinkButton href="/budgets/new" variant="primary" size="sm">
                    Set up a budget
                  </LinkButton>
                }
              />
              {suggestions.length > 0 ? (
                <div className="border-t border-rule px-4 py-4">
                  <div className="eyebrow mb-3">Suggested from your history</div>
                  <ul className="flex flex-col gap-2">
                    {suggestions.slice(0, 6).map((s) => (
                      <li key={s.categoryId} className="flex items-center gap-2 text-sm">
                        <Dot index={s.colorIndex} />
                        <span className="truncate">{s.categoryName}</span>
                        <Amount value={s.suggested} size="sm" className="ml-auto" />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-ink-tertiary">
                    Each figure is the median of your last three months, rounded up — not an
                    average, so one unusual month doesn&rsquo;t inflate the limit.
                  </p>
                </div>
              ) : null}
            </Panel>
          </div>
        </main>
      </>
    );
  }

  const budget = budgets[0];
  const adherence = await adherenceSeries(actor);

  const over = budget.lines.filter((l) => l.health === "OVER");
  const atRisk = budget.lines.filter((l) => l.health === "AT_RISK");
  const rest = budget.lines.filter((l) => l.health !== "OVER" && l.health !== "AT_RISK");

  return (
    <>
      <AppBar
        title="Budgets"
        sub={`${budget.window.label} · ${budget.daysRemaining} days left`}
        actions={
          <LinkButton href="/budgets/new" variant="primary" size="sm">
            <IconPlus size={15} /> Budget
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <section className="pt-5 pb-2">
            <div className="eyebrow">
              {budget.name} · {titleCase(budget.period)}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <Amount value={budget.totalSpent} size="display" />
              <span className="text-ink-tertiary">
                of <Amount value={budget.totalLimit} size="base" tone="muted" />
              </span>
            </div>

            <div className="mt-4">
              <Meter
                value={budget.usedFraction}
                mark={budget.elapsedFraction}
                tone={
                  budget.health === "OVER" ? "over" : budget.health === "AT_RISK" ? "warn" : "ok"
                }
                label="Overall budget"
                className="h-2"
              />
            </div>
            <div className="mt-2 flex text-xs text-ink-tertiary">
              <span>
                <Percent value={budget.usedFraction} digits={1} /> spent
              </span>
              <span className="ml-auto">
                Pace marker at <Percent value={budget.elapsedFraction} digits={0} /> of the period
              </span>
            </div>

            {budget.health === "OVER" || budget.health === "AT_RISK" ? (
              <Callout
                tone={budget.health === "OVER" ? "danger" : "warning"}
                icon={<IconAlert />}
                className="mt-4"
              >
                Discretionary spending is{" "}
                <b>{Math.round(Math.abs(budget.paceDelta) * 100)} points ahead of pace</b>. On this
                trajectory {budget.window.label} closes at{" "}
                <Amount value={budget.projected} size="sm" /> —{" "}
                <Amount value={budget.projectedOverrun} size="sm" /> over.
              </Callout>
            ) : (
              <Callout tone="inflow" icon={<IconCheck />} className="mt-4">
                On track. Projected to close at <Amount value={budget.projected} size="sm" />, which
                is within the <Amount value={budget.totalLimit} size="sm" /> limit.
              </Callout>
            )}
          </section>

          <StatGrid>
            <Stat label="Limit" value={<Amount value={budget.totalLimit} size="lg" bare />} />
            <Stat label="Spent" value={<Amount value={budget.totalSpent} size="lg" bare />} />
            <Stat
              label="Remaining"
              value={<Amount value={budget.totalRemaining} size="lg" bare />}
              delta={`${budget.daysRemaining} days left`}
            />
            <Stat
              label="Projected close"
              value={<Amount value={budget.projected} size="lg" bare />}
            />
          </StatGrid>

          {over.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Over budget" meta={`${over.length}`} />
              <Panel className="border-danger/30">
                {over.map((line) => (
                  <LineRow key={line.categoryId} line={line} elapsed={budget.elapsedFraction} />
                ))}
              </Panel>
            </section>
          ) : null}

          {atRisk.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Heading over" meta={`${atRisk.length}`} />
              <Panel className="border-warning/30">
                {atRisk.map((line) => (
                  <LineRow key={line.categoryId} line={line} elapsed={budget.elapsedFraction} />
                ))}
              </Panel>
            </section>
          ) : null}

          <section className="mt-6">
            <SectionHead
              title={over.length || atRisk.length ? "On track" : "By category"}
              meta={`${rest.length} of ${budget.lines.length}`}
            />
            <Panel>
              {rest.map((line) => (
                <LineRow key={line.categoryId} line={line} elapsed={budget.elapsedFraction} />
              ))}
            </Panel>
          </section>

          {adherence.length > 1 ? (
            <section className="mt-6">
              <Panel>
                <PanelHead title="Adherence" action="Last 6 months" />
                <PanelBody>
                  <BarSeries
                    data={adherence.map((a) => ({
                      label: a.label,
                      value: a.percent,
                      tone: a.percent > 100 ? "danger" : a.percent > 92 ? "warning" : "transfer",
                    }))}
                    height={110}
                    ariaLabel="Spend as a percentage of budget, by month"
                  />
                  <p className="mt-3 text-xs text-ink-tertiary">
                    Each bar is spend as a percentage of the limit.{" "}
                    {adherence.filter((a) => a.percent > 100).length} of {adherence.length} months
                    closed over.
                  </p>
                </PanelBody>
              </Panel>
            </section>
          ) : null}

          {budgets.length > 1 ? (
            <section className="mt-6">
              <SectionHead title="Other budgets" />
              <Panel>
                {budgets.slice(1).map((b) => (
                  <Link
                    key={b.id}
                    href={`/budgets/${b.id}`}
                    className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0 hover:bg-rule-faint"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{b.name}</span>
                      <span className="block truncate text-xs text-ink-tertiary">
                        {titleCase(b.period)} · {b.window.label}
                      </span>
                    </span>
                    <Amount value={b.totalSpent} size="sm" />
                    <span className="text-xs text-ink-tertiary">
                      / <Amount value={b.totalLimit} size="sm" tone="muted" bare />
                    </span>
                  </Link>
                ))}
              </Panel>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}

function LineRow({ line, elapsed }: { line: budgetService.BudgetLineDTO; elapsed: number }) {
  const overBy = BigInt(line.remaining.minor) < 0n;

  return (
    <Link
      href={`/transactions?category=${line.categoryId}`}
      className="flex flex-col gap-2 border-b border-rule-faint px-4 py-3 last:border-0 transition-colors hover:bg-rule-faint"
    >
      <div className="flex items-baseline gap-2">
        <Dot index={line.colorIndex} />
        <span className="truncate text-base lg:text-sm">{line.categoryName}</span>
        {line.fixed ? <Badge>fixed</Badge> : null}
        {line.rollover ? <Badge tone="info">rollover</Badge> : null}
        <span className="ml-auto shrink-0 text-sm">
          <Amount value={line.spent} size="sm" bare />
          <span className="text-ink-tertiary">
            {" / "}
            <Amount value={line.effectiveLimit} size="sm" tone="muted" bare />
          </span>
        </span>
      </div>

      <Meter
        value={line.usedFraction}
        mark={line.fixed ? null : elapsed}
        tone={line.health === "OVER" ? "over" : line.health === "AT_RISK" ? "warn" : "ok"}
        label={`${line.categoryName}: ${Math.round(line.usedFraction * 100)}% used`}
      />

      <div className="flex text-xs">
        <span className={overBy ? "text-danger" : "text-ink-tertiary"}>
          {overBy ? (
            <>
              Over by <Amount value={line.remaining} size="sm" tone="outflow" sign="never" bare />
            </>
          ) : (
            <>
              <Amount value={line.remaining} size="sm" tone="muted" bare /> left
            </>
          )}
          {line.rollover ? " · includes rollover" : ""}
          {line.fixed ? " · fixed cost" : ` · ${line.transactionCount} transactions`}
        </span>
        <span className="num ml-auto text-ink-tertiary">
          {Math.round(line.usedFraction * 100)}%
        </span>
      </div>
    </Link>
  );
}

/**
 * Spend as a percentage of limit, per month.
 *
 * Uses the current limits against each past month's actual spend. That is an
 * approximation — limits change — and it is labelled as adherence rather than
 * history for that reason.
 */
async function adherenceSeries(
  actor: Awaited<ReturnType<typeof requireUserPage>>,
): Promise<Array<{ label: string; percent: number }>> {
  const flow = await analyticsService.cashFlow(actor, 6);
  const budgets = await budgetService.list(actor);
  const limit = budgets[0] ? Number(budgets[0].totalLimit.decimal) : 0;
  if (limit <= 0) return [];

  return flow.map((f) => ({
    label: new Date(`${f.month}-01T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      timeZone: "UTC",
    }),
    percent: Math.round((Number(f.spending.decimal) / limit) * 100),
  }));
}

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
