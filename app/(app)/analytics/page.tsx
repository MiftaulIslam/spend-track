import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount, Delta, Percent } from "@/src/components/money";
import { BarSeries, Donut, FlowBars, Sparkline } from "@/src/components/charts";
import {
  Dot,
  EmptyState,
  Meter,
  Panel,
  PanelBody,
  PanelHead,
  Stat,
  StatGrid,
  Table,
  Td,
  Th,
} from "@/src/components/ui";
import { IconChart, IconUpload } from "@/src/components/icons";
import * as analyticsService from "@/src/server/services/analytics-service";
import * as accountService from "@/src/server/services/account-service";
import * as subscriptionService from "@/src/server/services/subscription-service";

export const metadata = { title: "Analytics" };

type View = "flow" | "categories" | "merchants" | "networth" | "accounts" | "comparison";

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "flow", label: "Cash flow" },
  { key: "categories", label: "Categories" },
  { key: "merchants", label: "Merchants" },
  { key: "networth", label: "Net worth" },
  { key: "accounts", label: "Accounts" },
  { key: "comparison", label: "Comparison" },
];

/**
 * Analytics.
 *
 * Every figure here is a SQL aggregate. The AI is never asked to produce a
 * number that appears on this page — at most it is given these results and
 * asked to explain them, which is the only division of labour that keeps the
 * figures trustworthy.
 */
export default async function AnalyticsPage(props: PageProps<"/analytics">) {
  const actor = await requireUserPage("/analytics");
  const params = await props.searchParams;
  const view = (typeof params.view === "string" ? params.view : "flow") as View;
  const months = Number(typeof params.months === "string" ? params.months : "12") || 12;

  const range = analyticsService.resolveRange(actor, { period: "MONTHLY" });
  const [overview, flow] = await Promise.all([
    analyticsService.overview(actor, { period: "MONTHLY" }),
    analyticsService.cashFlow(actor, months),
  ]);

  if (overview.transactionCount === 0 && flow.every((f) => f.spending.decimal === "0.00")) {
    return (
      <>
        <AppBar title="Analytics" />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconChart />}
                title="Nothing to analyse yet"
                body="Once you have a few weeks of transactions, this page shows where the money goes, how it compares to previous periods, and which merchants drive it."
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
        title="Analytics"
        sub={`${flow[0]?.month ?? ""} – ${flow.at(-1)?.month ?? ""} · ${actor.baseCurrency}`}
        actions={
          <Link
            href="/reports"
            className="grid size-9 place-items-center rounded-md text-ink-secondary hover:bg-rule-faint"
            aria-label="Reports and exports"
          >
            <IconUpload size={18} />
          </Link>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pt-3 pb-1 lg:px-8">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/analytics?view=${v.key}`}
              aria-current={view === v.key ? "page" : undefined}
              className={
                view === v.key
                  ? "inline-flex h-7 shrink-0 items-center rounded-full border border-ink bg-ink px-2.5 text-xs font-medium text-ink-inverse"
                  : "inline-flex h-7 shrink-0 items-center rounded-full border border-rule bg-surface px-2.5 text-xs font-medium text-ink-secondary hover:border-rule-strong hover:text-ink"
              }
            >
              {v.label}
            </Link>
          ))}
        </div>

        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <div className="mt-3">
            <StatGrid>
              <Stat
                label="Income"
                value={<Amount value={overview.income} size="lg" tone="inflow" bare />}
                delta={<Delta value={overview.changes.income} goodWhen="up" />}
              />
              <Stat
                label="Spending"
                value={<Amount value={overview.spending} size="lg" bare />}
                delta={<Delta value={overview.changes.spending} goodWhen="down" />}
              />
              <Stat
                label="Net"
                value={<Amount value={overview.net} size="lg" bare />}
                delta={
                  <span className="text-ink-tertiary">
                    <Percent value={overview.savingsRate} /> savings rate
                  </span>
                }
              />
              <Stat
                label="Net worth"
                value={<Amount value={overview.netWorth.net} size="lg" bare />}
              />
            </StatGrid>
          </div>

          {view === "flow" ? <FlowView flow={flow} /> : null}
          {view === "categories" ? <CategoriesView range={range} /> : null}
          {view === "merchants" ? <MerchantsView range={range} /> : null}
          {view === "networth" ? <NetWorthView months={months} /> : null}
          {view === "accounts" ? <AccountsView range={range} /> : null}
          {view === "comparison" ? <ComparisonView /> : null}

          <p className="mt-8 text-center text-xs leading-relaxed text-ink-tertiary">
            Transfers between your own accounts and credit-card payments are excluded from spending
            and income. Refunds reduce spending in their original category.
          </p>
        </div>
      </main>
    </>
  );
}

/* ---------------------------------------------------------------- flow */

function FlowView({ flow }: { flow: Awaited<ReturnType<typeof analyticsService.cashFlow>> }) {
  const positiveMonths = flow.filter((f) => Number(f.net.decimal) > 0).length;

  return (
    <>
      <section className="mt-6">
        <Panel>
          <PanelHead title="Monthly cash flow" action={`${flow.length} months`} />
          <PanelBody>
            <FlowBars
              data={flow.map((f) => ({
                label: monthLabel(f.month),
                income: Number(f.income.decimal),
                spending: Number(f.spending.decimal),
              }))}
              height={170}
            />
            <p className="mt-3 text-xs text-ink-tertiary">
              Positive in {positiveMonths} of {flow.length} months.
            </p>
          </PanelBody>
        </Panel>
      </section>

      <section className="mt-3">
        <Panel>
          <PanelHead title="Savings rate" action="Target 20%" />
          <PanelBody>
            <BarSeries
              data={flow.map((f) => ({
                label: monthLabel(f.month),
                value: Math.max(0, Math.round(f.savingsRate * 100)),
                tone: f.savingsRate >= 0.2 ? "inflow" : f.savingsRate > 0 ? "warning" : "danger",
              }))}
              height={110}
              ariaLabel="Savings rate by month"
            />
            <p className="mt-3 text-xs leading-relaxed text-ink-tertiary">
              Savings rate is (income − spending) ÷ income, with transfers and card payments
              excluded so moving money between your own accounts never looks like saving.
            </p>
          </PanelBody>
        </Panel>
      </section>

      <section className="mt-3">
        <Panel>
          <PanelHead title="By month" />
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th numeric>In</Th>
                <Th numeric>Out</Th>
                <Th numeric>Net</Th>
                <Th numeric>Rate</Th>
              </tr>
            </thead>
            <tbody>
              {[...flow].reverse().map((f) => (
                <tr key={f.month}>
                  <Td>{monthLabel(f.month, true)}</Td>
                  <Td numeric>
                    <Amount value={f.income} size="sm" tone="inflow" bare />
                  </Td>
                  <Td numeric>
                    <Amount value={f.spending} size="sm" bare />
                  </Td>
                  <Td numeric>
                    <Amount
                      value={f.net}
                      size="sm"
                      tone={Number(f.net.decimal) < 0 ? "outflow" : "inflow"}
                      bare
                    />
                  </Td>
                  <Td numeric>
                    <Percent value={f.savingsRate} digits={0} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </section>
    </>
  );
}

/* ---------------------------------------------------------- categories */

async function CategoriesView({ range }: { range: analyticsService.Range }) {
  const actor = await requireUserPage();
  const categories = await analyticsService.categoryBreakdown(actor, range);

  if (categories.length === 0) {
    return (
      <Panel className="mt-6">
        <EmptyState
          title="No categorised spending this period"
          body="Category totals appear as soon as transactions are categorised."
        />
      </Panel>
    );
  }

  return (
    <section className="mt-6">
      <Panel>
        <PanelHead
          title={`${range.label} by category`}
          action={`${categories.length} categories`}
        />
        <PanelBody className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <Donut
            segments={categories
              .slice(0, 8)
              .map((c) => ({
                label: c.name,
                value: Number(c.amount.decimal),
                colorIndex: c.colorIndex,
              }))}
            size={168}
          />
          <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {categories.map((c) => (
              <li key={c.categoryId ?? c.name}>
                <Link
                  href={
                    c.categoryId
                      ? `/transactions?category=${c.categoryId}`
                      : "/transactions?uncategorised=true"
                  }
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  <Dot index={c.colorIndex} />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-tertiary">{c.count}</span>
                  <Amount value={c.amount} size="sm" className="w-24 shrink-0 text-right" bare />
                  <span className="num w-12 shrink-0 text-right text-xs text-ink-tertiary">
                    {Math.round(c.fraction * 100)}%
                  </span>
                </Link>
                <div className="mt-1">
                  <Meter value={c.fraction} tone="ok" label={`${c.name} share`} />
                </div>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>
    </section>
  );
}

/* ----------------------------------------------------------- merchants */

async function MerchantsView({ range }: { range: analyticsService.Range }) {
  const actor = await requireUserPage();
  const [merchants, yearMerchants] = await Promise.all([
    analyticsService.topMerchants(actor, range, 15),
    analyticsService.topMerchants(
      actor,
      {
        from: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
        to: new Date(),
        label: "This year",
      },
      15,
    ),
  ]);

  return (
    <section className="mt-6 grid gap-3 lg:grid-cols-2">
      {[
        { title: range.label, rows: merchants },
        { title: "This year", rows: yearMerchants },
      ].map((group) => (
        <Panel key={group.title}>
          <PanelHead title={group.title} action="by spend" />
          {group.rows.length === 0 ? (
            <EmptyState
              title="No merchant data"
              body="Merchants are normalised from bank descriptors as transactions arrive."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Merchant</Th>
                  <Th numeric>Visits</Th>
                  <Th numeric>Total</Th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((m) => (
                  <tr key={m.merchantId}>
                    <Td>
                      <Link
                        href={`/transactions?search=${encodeURIComponent(m.name)}`}
                        className="hover:underline"
                      >
                        {m.name}
                      </Link>
                    </Td>
                    <Td numeric>{m.count}</Td>
                    <Td numeric>
                      <Amount value={m.total} size="sm" bare />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      ))}
    </section>
  );
}

/* ----------------------------------------------------------- net worth */

async function NetWorthView({ months }: { months: number }) {
  const actor = await requireUserPage();
  const series = await accountService.netWorthHistory(actor, months);
  const first = Number(series[0]?.net.decimal ?? 0);
  const last = Number(series.at(-1)?.net.decimal ?? 0);

  return (
    <section className="mt-6">
      <Panel>
        <PanelHead title="Net worth" action={`${months} months`} />
        <PanelBody>
          <Sparkline
            points={series.map((s) => Number(s.net.decimal))}
            stroke={last >= first ? "inflow" : "outflow"}
            height={140}
            ariaLabel="Net worth over time"
          />
          <div className="num mt-1 flex justify-between text-2xs text-ink-tertiary">
            <span>{monthLabel(series[0]?.month ?? "")}</span>
            <span>{monthLabel(series.at(-1)?.month ?? "")}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-tertiary">
            Each month is valued at that month&rsquo;s own exchange rates, so a currency move does
            not rewrite your history. {last >= first ? "Up" : "Down"}{" "}
            {Math.abs(last - first).toLocaleString("en-US", { maximumFractionDigits: 0 })}{" "}
            {actor.baseCurrency} over the period.
          </p>
        </PanelBody>
      </Panel>
    </section>
  );
}

/* ------------------------------------------------------------ accounts */

async function AccountsView({ range }: { range: analyticsService.Range }) {
  const actor = await requireUserPage();
  const [rows, subs] = await Promise.all([
    analyticsService.byAccount(actor, range),
    subscriptionService.summary(actor),
  ]);

  return (
    <>
      <section className="mt-6">
        <Panel>
          <PanelHead title={`${range.label} by account`} />
          {rows.length === 0 ? (
            <EmptyState
              title="No activity this period"
              body="Account activity appears here once transactions are recorded."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Type</Th>
                  <Th numeric>Out</Th>
                  <Th numeric>In</Th>
                  <Th numeric>Txns</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.accountId}>
                    <Td>
                      <Link href={`/accounts/${r.accountId}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </Td>
                    <Td className="text-xs text-ink-tertiary">{titleCase(r.type)}</Td>
                    <Td numeric>
                      <Amount value={r.spending} size="sm" bare />
                    </Td>
                    <Td numeric>
                      <Amount value={r.income} size="sm" tone="inflow" bare />
                    </Td>
                    <Td numeric>{r.count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </section>

      <section className="mt-3">
        <Panel>
          <PanelHead title="Subscriptions" action={<Link href="/subscriptions">Manage</Link>} />
          <PanelBody className="flex flex-wrap gap-6">
            <div>
              <div className="eyebrow">Monthly</div>
              <Amount value={subs.monthlyTotal} size="lg" className="mt-1" />
            </div>
            <div>
              <div className="eyebrow">Annualised</div>
              <Amount value={subs.annualTotal} size="lg" className="mt-1" />
            </div>
            <div>
              <div className="eyebrow">Unused</div>
              <div className="num mt-1 text-lg">
                {subs.unusedCount}
                {subs.unusedCount > 0 ? (
                  <span className="ml-2 text-xs text-ink-tertiary">
                    <Amount value={subs.unusedAnnualCost} size="sm" tone="muted" /> a year
                  </span>
                ) : null}
              </div>
            </div>
          </PanelBody>
        </Panel>
      </section>
    </>
  );
}

/* ---------------------------------------------------------- comparison */

async function ComparisonView() {
  const actor = await requireUserPage();
  const rows = await analyticsService.yearOverYear(actor);
  const thisYear = new Date().getUTCFullYear();

  return (
    <section className="mt-6">
      <Panel>
        <PanelHead title="Year over year" action={`${thisYear - 1} vs ${thisYear}`} />
        <Table>
          <thead>
            <tr>
              <Th />
              <Th numeric>{thisYear - 1}</Th>
              <Th numeric>{thisYear}</Th>
              <Th numeric>Change</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <Td>{r.label}</Td>
                <Td numeric>
                  <Amount value={r.previous} size="sm" tone="muted" bare />
                </Td>
                <Td numeric>
                  <Amount value={r.current} size="sm" bare />
                </Td>
                <Td numeric>
                  <span className={r.improved ? "text-inflow" : "text-outflow"}>
                    <Percent value={r.change} sign digits={1} />
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <PanelBody className="pt-3">
          <p className="text-xs leading-relaxed text-ink-tertiary">
            {thisYear} is a partial year, so totals are lower by construction. The change column
            compares the full calendar years as recorded.
          </p>
        </PanelBody>
      </Panel>
    </section>
  );
}

/* ------------------------------------------------------------- helpers */

function monthLabel(month: string, long = false): string {
  if (!month) return "";
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    ...(long ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const titleCase = (s: string): string =>
  s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
