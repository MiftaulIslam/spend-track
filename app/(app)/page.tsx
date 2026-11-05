import Link from "next/link";
import { formatToday, hourInTimezone } from "@/src/domain/datetime";
import { Suspense } from "react";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount, Delta, Percent } from "@/src/components/money";
import { Donut, FlowBars, Sparkline } from "@/src/components/charts";
import { ListRow, TransactionRow } from "@/src/components/transaction-row";
import {
  Badge,
  Callout,
  Dot,
  EmptyState,
  ListSkeleton,
  Meter,
  Panel,
  PanelBody,
  PanelFoot,
  PanelHead,
  SectionHead,
  Skeleton,
  Stat,
  StatGrid,
} from "@/src/components/ui";
import {
  IconAlert,
  IconArrowRight,
  IconArrowUp,
  IconBell,
  IconList,
  IconReceipt,
  IconRepeat,
  IconSearch,
  IconSparkle,
  IconWallet,
  IconZap,
} from "@/src/components/icons";
import * as analyticsService from "@/src/server/services/analytics-service";
import * as budgetService from "@/src/server/services/budget-service";
import * as transactionService from "@/src/server/services/transaction-service";
import * as billService from "@/src/server/services/bill-service";
import * as recurringService from "@/src/server/services/recurring-service";
import * as accountService from "@/src/server/services/account-service";
import { transactionFilterSchema } from "@/src/lib/schemas";
import { WeeklyBrief } from "@/src/components/weekly-brief";

export const metadata = { title: "Overview" };

/**
 * The dashboard.
 *
 * Structured around the order people actually want: the one number that
 * matters, then this period's flow, then what is about to go wrong (budgets),
 * then what is about to happen (the next two weeks), then detail.
 *
 * Each panel is its own Suspense boundary, so the headline number paints as
 * soon as it is ready rather than waiting on the slowest query.
 */
export default async function DashboardPage() {
  const actor = await requireUserPage("/");
  const greeting = greetingFor(actor.timezone);

  return (
    <>
      <AppBar
        title={`${greeting}, ${firstName(actor.name ?? actor.email)}`}
        sub={formatToday(actor.timezone)}
        actions={
          <>
            <Link
              href="/transactions"
              className="grid size-9 place-items-center rounded-md text-ink-secondary hover:bg-rule-faint"
              aria-label="Search transactions"
            >
              <IconSearch size={18} />
            </Link>
            <Link
              href="/notifications"
              className="grid size-9 place-items-center rounded-md text-ink-secondary hover:bg-rule-faint lg:hidden"
              aria-label="Notifications"
            >
              <IconBell size={18} />
            </Link>
          </>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <Suspense fallback={<HeadlineSkeleton />}>
            <Headline />
          </Suspense>

          <Suspense fallback={<Skeleton className="mt-6 h-40 rounded-lg" />}>
            <BudgetPulse />
          </Suspense>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
              <UpcomingPanel />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
              <SpendingPanel />
            </Suspense>
          </div>

          <Suspense fallback={<Skeleton className="mt-6 h-40 rounded-lg" />}>
            <WeeklyBrief />
          </Suspense>

          <section className="mt-6">
            <SectionHead
              title="Recent activity"
              action={
                <Link href="/transactions" className="flex items-center gap-1 hover:text-ink">
                  All <IconArrowRight size={13} />
                </Link>
              }
            />
            <Panel flush>
              <Suspense fallback={<ListSkeleton rows={5} />}>
                <RecentActivity />
              </Suspense>
            </Panel>
          </section>

          <Suspense fallback={null}>
            <AttentionStrip />
          </Suspense>
        </div>
      </main>
    </>
  );
}

/* --------------------------------------------------------------- headline */

async function Headline() {
  const actor = await requireUserPage();
  const [overview, netWorthSeries] = await Promise.all([
    analyticsService.overview(actor, { period: "MONTHLY" }),
    accountService.netWorthHistory(actor, 12),
  ]);

  const points = netWorthSeries.map((p) => Number(p.net.decimal));
  const monthChange =
    netWorthSeries.length >= 2
      ? Number(netWorthSeries[netWorthSeries.length - 1].net.decimal) -
        Number(netWorthSeries[netWorthSeries.length - 2].net.decimal)
      : 0;

  return (
    <>
      <section className="pt-6 pb-5">
        <div className="eyebrow">Net worth · {actor.baseCurrency}</div>
        <div className="mt-2">
          <Amount value={overview.netWorth.net} size="hero" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {monthChange !== 0 ? (
            <Badge tone={monthChange > 0 ? "inflow" : "outflow"}>
              <IconArrowUp size={11} className={monthChange > 0 ? "" : "rotate-180"} />
              {monthChange > 0 ? "+" : "−"}
              {Math.abs(monthChange).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Badge>
          ) : null}
          <span className="text-ink-tertiary">this month</span>
          <span className="text-ink-disabled">·</span>
          <span className="text-ink-tertiary">
            assets <Amount value={overview.netWorth.assets} size="sm" tone="muted" />, owing{" "}
            <Amount value={overview.netWorth.liabilities} size="sm" tone="muted" />
          </span>
        </div>

        {points.length >= 2 ? (
          <div className="mt-4 -mx-1">
            <Sparkline
              points={points}
              stroke="inflow"
              height={64}
              ariaLabel="Net worth over the last 12 months"
            />
            <div className="num flex justify-between px-1 pt-1 text-2xs text-ink-tertiary">
              <span>{monthLabel(netWorthSeries[0]?.month)}</span>
              <span>
                {monthLabel(netWorthSeries[Math.floor(netWorthSeries.length / 2)]?.month)}
              </span>
              <span>{monthLabel(netWorthSeries[netWorthSeries.length - 1]?.month)}</span>
            </div>
          </div>
        ) : null}
      </section>

      <StatGrid>
        <Stat
          label={`In · ${shortMonth(actor.timezone)}`}
          value={<Amount value={overview.income} tone="inflow" size="lg" bare />}
          delta={
            <>
              <Delta value={overview.changes.income} goodWhen="up" />
              <span className="text-ink-tertiary">{comparisonLabel(overview.partial)}</span>
            </>
          }
        />
        <Stat
          label={`Out · ${shortMonth(actor.timezone)}`}
          value={<Amount value={overview.spending} size="lg" bare />}
          delta={
            <>
              <Delta value={overview.changes.spending} goodWhen="down" />
              <span className="text-ink-tertiary">{comparisonLabel(overview.partial)}</span>
            </>
          }
        />
        <Stat
          label="Saved"
          value={<Amount value={overview.net} size="lg" bare />}
          delta={
            <span className="text-ink-tertiary">
              <Percent value={overview.savingsRate} /> rate
            </span>
          }
        />
        <Stat
          label="Transactions"
          value={<span className="num">{overview.transactionCount.toLocaleString()}</span>}
          delta={<span className="text-ink-tertiary">this month</span>}
        />
      </StatGrid>
    </>
  );
}

function HeadlineSkeleton() {
  return (
    <>
      <section className="pt-6 pb-5">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="mt-3 h-11 w-64" />
        <Skeleton className="mt-3 h-4 w-48" />
        <Skeleton className="mt-4 h-16 w-full rounded-md" />
      </section>
      <div className="grid grid-cols-2 gap-px overflow-clip rounded-lg border border-rule bg-rule md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 bg-surface p-4">
            <Skeleton className="h-2 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ budget pulse */

async function BudgetPulse() {
  const actor = await requireUserPage();
  const budgets = await budgetService.list(actor);

  if (budgets.length === 0) {
    return (
      <section className="mt-6">
        <SectionHead title="Budget pulse" />
        <Panel>
          <EmptyState
            icon={<IconZap />}
            title="No budgets yet"
            body="Budgets work best when they start from what you actually spend. We can propose limits from your last three months."
            action={
              <Link
                href="/budgets/new"
                className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-sm font-medium text-ink-inverse"
              >
                Propose budgets
              </Link>
            }
          />
        </Panel>
      </section>
    );
  }

  // The lines that need attention first, then the healthy ones — a dashboard
  // that leads with what is fine buries what is not.
  const lines = budgets
    .flatMap((b) => b.lines.map((l) => ({ ...l, budgetId: b.id, elapsed: b.elapsedFraction })))
    .sort((a, b) => healthRank(b.health) - healthRank(a.health) || b.usedFraction - a.usedFraction)
    .slice(0, 4);

  const overall = budgets[0];

  return (
    <section className="mt-6">
      <SectionHead
        title="Budget pulse"
        meta={`${overall.daysRemaining} days left`}
        action={
          <Link href="/budgets" className="flex items-center gap-1 hover:text-ink">
            All budgets <IconArrowRight size={13} />
          </Link>
        }
      />

      {overall.health === "AT_RISK" || overall.health === "OVER" ? (
        <Callout
          tone={overall.health === "OVER" ? "danger" : "warning"}
          icon={<IconAlert />}
          className="mb-3"
        >
          Spending is <b>{Math.round(Math.abs(overall.paceDelta) * 100)} points ahead of pace</b>.
          At this rate {overall.window.label} closes at{" "}
          <Amount value={overall.projected} size="sm" /> —{" "}
          <Amount value={overall.projectedOverrun} size="sm" /> over.
        </Callout>
      ) : null}

      <Panel>
        {lines.map((line) => (
          <Link
            key={`${line.budgetId}-${line.categoryId}`}
            href={`/budgets/${line.budgetId}`}
            className="flex flex-col gap-2 border-b border-rule-faint px-4 py-3 transition-colors last:border-0 hover:bg-rule-faint"
          >
            <div className="flex items-baseline gap-2">
              <Dot index={line.colorIndex} />
              <span className="text-base lg:text-sm">{line.categoryName}</span>
              <span className="num ml-auto text-sm">
                <Amount value={line.spent} size="sm" bare />
                <span className="text-ink-tertiary">
                  {" / "}
                  <Amount value={line.effectiveLimit} size="sm" tone="muted" bare />
                </span>
              </span>
            </div>
            <Meter
              value={line.usedFraction}
              // A fixed cost has no pace to be ahead of, so no marker is shown.
              mark={line.fixed ? null : line.elapsed}
              tone={line.health === "OVER" ? "over" : line.health === "AT_RISK" ? "warn" : "ok"}
              label={`${line.categoryName}: ${Math.round(line.usedFraction * 100)}% used`}
            />
            <div className="flex text-xs">
              <span className={line.health === "OVER" ? "text-danger" : "text-ink-tertiary"}>
                {line.health === "OVER" ? (
                  <>
                    Over by{" "}
                    <Amount value={line.remaining} size="sm" tone="outflow" sign="never" bare />
                  </>
                ) : (
                  <>
                    <Amount value={line.remaining} size="sm" tone="muted" bare /> left
                  </>
                )}
                {" · "}
                {line.fixed
                  ? "fixed cost"
                  : `${Math.round(line.elapsed * 100)}% of the period gone`}
              </span>
              <span className="num ml-auto text-ink-tertiary">
                {Math.round(line.usedFraction * 100)}%
              </span>
            </div>
          </Link>
        ))}
      </Panel>
    </section>
  );
}

const healthRank = (h: string): number =>
  ({ OVER: 4, AT_RISK: 3, ON_TRACK: 2, UNDER: 1, ALLOCATED: 0 })[h] ?? 0;

/* ---------------------------------------------------------------- upcoming */

async function UpcomingPanel() {
  const actor = await requireUserPage();
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  const [bills, recurring] = await Promise.all([
    billService.occurrencesInRange(actor, now, horizon),
    recurringService.upcoming(actor, 14),
  ]);

  const items = [
    ...bills
      .filter((b) => b.state !== "PAID" && b.state !== "SKIPPED")
      .map((b) => ({
        key: `bill-${b.id}`,
        name: b.billName,
        when: b.dueOn,
        amount: b.expected,
        sub: `${relativeDay(b.dueOn)} · ${b.accountName}${b.isEstimate ? " · estimated" : ""}`,
        kind: "bill" as const,
        overdue: b.state === "OVERDUE",
      })),
    ...recurring.map((r) => ({
      key: `rec-${r.id}-${r.dueOn}`,
      name: r.name,
      when: r.dueOn,
      amount: r.amount,
      sub: `${relativeDay(r.dueOn)} · ${r.accountName}`,
      kind: r.type === "INCOME" ? ("income" as const) : ("recurring" as const),
      overdue: false,
    })),
  ]
    .sort((a, b) => a.when.localeCompare(b.when))
    .slice(0, 6);

  return (
    <Panel>
      <PanelHead
        title="Next 14 days"
        action={
          <Link href="/calendar" className="hover:text-ink">
            Calendar
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="Bills, subscriptions and recurring transactions in the next two weeks will show here."
        />
      ) : (
        <div className="stagger">
          {items.map((item, i) => (
            <div key={item.key} style={{ "--i": i } as React.CSSProperties}>
              <ListRow
                href={item.kind === "bill" ? "/bills" : "/recurring"}
                icon={
                  item.kind === "bill" ? (
                    <IconReceipt size={16} />
                  ) : item.kind === "income" ? (
                    <IconWallet size={16} />
                  ) : (
                    <IconRepeat size={16} />
                  )
                }
                tone={
                  item.overdue
                    ? "--color-danger"
                    : item.kind === "income"
                      ? "--color-inflow"
                      : "--color-cat-4"
                }
                title={item.name}
                sub={item.sub}
                badge={item.overdue ? <Badge tone="danger">overdue</Badge> : null}
                right={
                  item.amount ? (
                    <Amount
                      value={item.amount}
                      size="sm"
                      tone={item.kind === "income" ? "inflow" : "default"}
                      sign={item.kind === "income" ? "always" : "never"}
                    />
                  ) : (
                    <span className="text-xs text-ink-tertiary">—</span>
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- spending */

async function SpendingPanel() {
  const actor = await requireUserPage();
  const range = analyticsService.resolveRange(actor, { period: "MONTHLY" });
  const [categories, flow] = await Promise.all([
    analyticsService.categoryBreakdown(actor, range),
    analyticsService.cashFlow(actor, 6),
  ]);

  const top = categories.slice(0, 6);
  const otherTotal = categories.slice(6).reduce((acc, c) => acc + Number(c.amount.decimal), 0);

  return (
    <Panel>
      <PanelHead
        title={`${range.label} spending`}
        action={
          <Link href="/analytics" className="hover:text-ink">
            Analytics
          </Link>
        }
      />
      {top.length === 0 ? (
        <EmptyState
          icon={<IconList />}
          title="Nothing spent yet this period"
          body="Categorised spending appears here as soon as you record a transaction."
        />
      ) : (
        <>
          <PanelBody className="flex items-center gap-4">
            <Donut
              segments={top.map((c) => ({
                label: c.name,
                value: Number(c.amount.decimal),
                colorIndex: c.colorIndex,
              }))}
              size={124}
            />
            <ul className="flex min-w-0 flex-1 flex-col gap-2 text-xs">
              {top.map((c) => (
                <li key={c.categoryId ?? c.name} className="flex items-center gap-2">
                  <Dot index={c.colorIndex} />
                  <span className="truncate">{c.name}</span>
                  <Amount value={c.amount} size="sm" className="ml-auto shrink-0" bare />
                </li>
              ))}
              {otherTotal > 0 ? (
                <li className="flex items-center gap-2 text-ink-tertiary">
                  <Dot index={12} />
                  <span>Everything else</span>
                  <span className="num ml-auto">{otherTotal.toFixed(2)}</span>
                </li>
              ) : null}
            </ul>
          </PanelBody>
          <PanelFoot>
            <FlowBars
              data={flow.map((f) => ({
                label: f.month.slice(5),
                income: Number(f.income.decimal),
                spending: Number(f.spending.decimal),
              }))}
              height={80}
            />
          </PanelFoot>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ recent list */

async function RecentActivity() {
  const actor = await requireUserPage();
  const filter = transactionFilterSchema.parse({ limit: 6 });
  const page = await transactionService.list(actor, filter);

  if (page.items.length === 0) {
    return (
      <EmptyState
        icon={<IconList />}
        title="No transactions yet"
        body="Add your first expense and SpendTrack starts learning your merchants and categories."
      />
    );
  }

  return (
    <div className="stagger">
      {page.items.map((txn, i) => (
        <div key={txn.id} style={{ "--i": i } as React.CSSProperties}>
          <TransactionRow txn={txn} href={`/transactions/${txn.id}`} dense />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- attention */

/** Things that are quietly wrong: stale reconciliation, unused subs, anomalies. */
async function AttentionStrip() {
  const actor = await requireUserPage();
  const [accounts, anomalies] = await Promise.all([
    accountService.list(actor),
    analyticsService.detectAnomalies(actor, { sinceDays: 7 }),
  ]);

  const needsReconcile = accounts.filter((a) => a.needsReconcile);
  if (needsReconcile.length === 0 && anomalies.length === 0) return null;

  return (
    <section className="mt-6 space-y-3">
      {needsReconcile.length > 0 ? (
        <Callout tone="warning" icon={<IconAlert />}>
          <b>{needsReconcile[0].name}</b> hasn&rsquo;t been reconciled in a while. Recorded balance
          is <Amount value={needsReconcile[0].balance} size="sm" />.{" "}
          <Link href={`/reconcile?account=${needsReconcile[0].id}`}>Reconcile now</Link>
        </Callout>
      ) : null}

      {anomalies.length > 0 ? (
        <Callout tone="brass" icon={<IconSparkle />}>
          <b>{anomalies[0].description}</b> for <Amount value={anomalies[0].amount} size="sm" /> —{" "}
          {anomalies[0].reason.toLowerCase()}.{" "}
          <Link href={`/transactions/${anomalies[0].transactionId}`}>Take a look</Link>
        </Callout>
      ) : null}
    </section>
  );
}

/* ----------------------------------------------------------------- helpers */

/** Greeting for the hour where the *user* is, not where the server is. */
function greetingFor(timezone: string): string {
  const hour = hourInTimezone(timezone);
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const firstName = (name: string): string => name.split(/[\s@]/)[0];
const shortMonth = (timezone: string): string =>
  formatToday(timezone, { month: "short" });

/**
 * Mid-period, the comparison is against the same number of days last period —
 * otherwise a half-finished month always reads as a collapse in income.
 */
const comparisonLabel = (partial: boolean): string =>
  partial ? "vs same point last month" : "vs last month";

function monthLabel(month?: string): string {
  if (!month) return "";
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

function relativeDay(iso: string): string {
  const target = new Date(iso);
  const days = Math.round((target.getTime() - Date.now()) / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days late`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return target.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return target.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
