import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { BarSeries } from "@/src/components/charts";
import {
  Badge,
  Callout,
  EmptyState,
  LinkButton,
  Panel,
  PanelBody,
  PanelHead,
  SectionHead,
  Stat,
  StatGrid,
} from "@/src/components/ui";
import { IconPlus, IconRepeat, IconSparkle } from "@/src/components/icons";
import * as subscriptionService from "@/src/server/services/subscription-service";
import * as analyticsService from "@/src/server/services/analytics-service";
import { CancelButton } from "./client";

export const metadata = { title: "Subscriptions" };

/**
 * Subscriptions.
 *
 * Sorted by **annual** cost, because that is the number that makes the decision:
 * a $17/month newspaper and a $204/year one are the same commitment, and a list
 * that shows "17" next to "204" is actively misleading. The monthly figure is
 * shown too, normalised from whatever the real billing cycle is.
 */
export default async function SubscriptionsPage() {
  const actor = await requireUserPage("/subscriptions");
  const [summary, subs, flow] = await Promise.all([
    subscriptionService.summary(actor),
    subscriptionService.list(actor),
    analyticsService.cashFlow(actor, 12),
  ]);

  if (subs.length === 0) {
    return (
      <>
        <AppBar
          title="Subscriptions"
          actions={
            <LinkButton href="/subscriptions/new" variant="primary" size="sm">
              <IconPlus size={15} /> Subscription
            </LinkButton>
          }
        />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconRepeat />}
                title="No subscriptions tracked"
                body="Add the services you pay for and SpendTrack normalises every billing cycle to a monthly and annual figure, then flags the ones you've stopped using."
                action={
                  <LinkButton href="/subscriptions/new" variant="primary" size="sm">
                    Add a subscription
                  </LinkButton>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  const active = subs.filter((s) => s.status === "ACTIVE" && !s.looksUnused);

  return (
    <>
      <AppBar
        title="Subscriptions"
        sub={`${summary.activeCount} active · ${summary.monthlyTotal.decimal} ${actor.baseCurrency} a month`}
        actions={
          <LinkButton href="/subscriptions/new" variant="primary" size="sm">
            <IconPlus size={15} /> Subscription
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <div className="mt-4">
            <StatGrid>
              <Stat
                label="Monthly"
                value={<Amount value={summary.monthlyTotal} size="lg" bare />}
              />
              <Stat
                label="Annualised"
                value={<Amount value={summary.annualTotal} size="lg" bare />}
                delta="if nothing changes"
              />
              <Stat
                label="Trials ending"
                value={<span className="num">{summary.trialsEndingSoon.length}</span>}
                delta={summary.trialsEndingSoon.length ? "within 14 days" : "none"}
                tone={summary.trialsEndingSoon.length ? "down" : undefined}
              />
              <Stat
                label="Unused 60d+"
                value={<span className="num">{summary.unusedCount}</span>}
                delta={summary.unusedCount ? `${summary.unusedAnnualCost.decimal} a year` : "none"}
                tone={summary.unusedCount ? "down" : undefined}
              />
            </StatGrid>
          </div>

          {summary.unusedCount > 0 ? (
            <Callout tone="brass" icon={<IconSparkle />} className="mt-4">
              {summary.unusedCount} {summary.unusedCount === 1 ? "service shows" : "services show"}{" "}
              no linked activity in 60+ days. Cancelling{" "}
              {summary.unusedCount === 1 ? "it" : "them all"} saves{" "}
              <b>
                <Amount value={summary.unusedAnnualCost} size="sm" />
              </b>{" "}
              a year.
            </Callout>
          ) : null}

          {summary.trialsEndingSoon.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Trials ending soon" />
              <Panel className="border-brass/30">
                {summary.trialsEndingSoon.map((sub) => (
                  <Row key={sub.id} sub={sub} highlight />
                ))}
              </Panel>
            </section>
          ) : null}

          {summary.unused.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Looks unused" meta={`${summary.unused.length}`} />
              <Panel className="border-warning/30">
                {summary.unused.map((sub) => (
                  <Row key={sub.id} sub={sub} />
                ))}
              </Panel>
            </section>
          ) : null}

          <section className="mt-6">
            <SectionHead title="Active" meta="sorted by annual cost" />
            <Panel>
              {active.map((sub) => (
                <Row key={sub.id} sub={sub} />
              ))}
            </Panel>
          </section>

          {flow.length > 2 ? (
            <section className="mt-6">
              <Panel>
                <PanelHead title="Total spending" action="12 months" />
                <PanelBody>
                  <BarSeries
                    data={flow.map((f) => ({
                      label: new Date(`${f.month}-01T12:00:00Z`).toLocaleDateString("en-GB", {
                        month: "short",
                        timeZone: "UTC",
                      }),
                      value: Number(f.spending.decimal),
                    }))}
                    color="cat-5"
                    height={100}
                    ariaLabel="Monthly spending"
                  />
                  <p className="mt-3 text-xs text-ink-tertiary">
                    Subscription charges are ordinary transactions, so they are included in your
                    budgets and category totals like anything else.
                  </p>
                </PanelBody>
              </Panel>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}

function Row({
  sub,
  highlight = false,
}: {
  sub: subscriptionService.SubscriptionDTO;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-md"
        style={{
          color: highlight ? "var(--color-brass)" : "var(--color-cat-5)",
          background: `color-mix(in oklab, ${highlight ? "var(--color-brass)" : "var(--color-cat-5)"} 11%, transparent)`,
        }}
        aria-hidden
      >
        <IconRepeat size={16} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-base lg:text-sm">{sub.name}</span>
          {sub.status === "TRIAL" ? <Badge tone="brass">trial</Badge> : null}
          {sub.looksUnused ? <Badge tone="warning">unused</Badge> : null}
        </span>
        <span className="block truncate text-xs text-ink-tertiary">
          {titleCase(sub.cycle)}
          {sub.planName ? ` · ${sub.planName}` : ""} · {sub.accountName}
          {sub.daysUntilTrialEnd !== null && sub.daysUntilTrialEnd >= 0
            ? ` · trial ends in ${sub.daysUntilTrialEnd}d, then ${sub.price.decimal}`
            : sub.daysUntilRenewal !== null && sub.daysUntilRenewal >= 0
              ? ` · renews in ${sub.daysUntilRenewal}d`
              : ""}
          {sub.unusedDays !== null && sub.looksUnused
            ? ` · no activity in ${sub.unusedDays} days`
            : ""}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <Amount value={sub.monthlyCost} size="md" sign="never" />
        <span className="block text-2xs text-ink-tertiary">
          <Amount value={sub.annualCost} size="sm" tone="muted" sign="never" bare /> a year
        </span>
      </span>

      {sub.status !== "CANCELLED" ? <CancelButton id={sub.id} name={sub.name} /> : null}
    </div>
  );
}

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
