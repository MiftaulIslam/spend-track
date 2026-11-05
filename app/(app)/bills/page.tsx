import { requireUserPage } from "@/src/server/auth/guards";
import { todayInTimezone } from "@/src/domain/datetime";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { BarSeries } from "@/src/components/charts";
import {
  Badge, Callout, EmptyState, LinkButton, Panel, PanelBody, PanelHead,
  SectionHead, Stat, StatGrid,
} from "@/src/components/ui";
import { IconAlert, IconCheck, IconPlus, IconReceipt, IconZap } from "@/src/components/icons";
import * as billService from "@/src/server/services/bill-service";
import { PayBillButton } from "./client";
import * as accountService from "@/src/server/services/account-service";

export const metadata = { title: "Bills" };

/**
 * Bills.
 *
 * A bill is a due date with an expectation, not a transaction. It only touches
 * the ledger when it is paid — which is why an estimated bill can carry an
 * estimate without polluting your spending figures.
 */
export default async function BillsPage() {
  const actor = await requireUserPage("/bills");
  const now = new Date();

  const [occurrences, accounts] = await Promise.all([
    billService.occurrencesInRange(
      actor,
      new Date(now.getTime() - 45 * 86_400_000),
      new Date(now.getTime() + 60 * 86_400_000),
    ),
    accountService.list(actor),
  ]);

  const overdue = occurrences.filter((o) => o.state === "OVERDUE");
  const due = occurrences.filter((o) => o.state === "DUE");
  const scheduled = occurrences.filter((o) => o.state === "SCHEDULED");
  const paid = occurrences.filter((o) => o.state === "PAID");

  if (occurrences.length === 0) {
    return (
      <>
        <AppBar
          title="Bills"
          actions={
            <LinkButton href="/bills/new" variant="primary" size="sm">
              <IconPlus size={15} /> Bill
            </LinkButton>
          }
        />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconReceipt />}
                title="No bills set up"
                body="Add your recurring bills and SpendTrack tracks due dates, estimates variable amounts from your own history, and nudges you before anything goes late."
                action={
                  <LinkButton href="/bills/new" variant="primary" size="sm">
                    Add a bill
                  </LinkButton>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  const monthTotal = sum([...overdue, ...due, ...scheduled, ...paid].filter(inThisMonth), actor.baseCurrency);
  const remaining = sum([...overdue, ...due, ...scheduled].filter(inThisMonth), actor.baseCurrency);
  const paidTotal = sum(paid.filter(inThisMonth), actor.baseCurrency, "paid");

  const payableAccounts = accounts
    .filter((a) => !a.archivedAt)
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  return (
    <>
      <AppBar
        title="Bills"
        sub={
          overdue.length
            ? `${overdue.length} overdue · ${due.length} due soon`
            : `${due.length} due soon · ${scheduled.length} scheduled`
        }
        actions={
          <LinkButton href="/bills/new" variant="primary" size="sm">
            <IconPlus size={15} /> Bill
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          {overdue.length > 0 ? (
            <Callout tone="danger" icon={<IconAlert />} className="mt-4">
              <b>{overdue[0].billName}</b> was due {formatDate(overdue[0].dueOn)} and is{" "}
              {Math.abs(overdue[0].daysUntil)} {Math.abs(overdue[0].daysUntil) === 1 ? "day" : "days"}{" "}
              late.
              {overdue.length > 1 ? ` ${overdue.length - 1} more are also overdue.` : ""}
            </Callout>
          ) : null}

          <div className="mt-4">
            <StatGrid>
              <Stat label="Due this month" value={<Amount value={monthTotal} size="lg" bare />} />
              <Stat label="Paid" value={<Amount value={paidTotal} size="lg" bare />} delta={`${paid.filter(inThisMonth).length} bills`} />
              <Stat
                label="Remaining"
                value={<Amount value={remaining} size="lg" bare />}
                delta={`${[...overdue, ...due, ...scheduled].filter(inThisMonth).length} bills`}
              />
              <Stat
                label="Overdue"
                value={<span className="num">{overdue.length}</span>}
                tone={overdue.length ? "down" : undefined}
              />
            </StatGrid>
          </div>

          {[
            { title: "Overdue", rows: overdue, tone: "border-danger/30" },
            { title: "Due soon", rows: due, tone: "border-warning/30" },
            { title: "Scheduled", rows: scheduled, tone: "" },
          ].map((group) =>
            group.rows.length > 0 ? (
              <section key={group.title} className="mt-6">
                <SectionHead title={group.title} meta={`${group.rows.length}`} />
                <Panel className={group.tone}>
                  {group.rows.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0"
                    >
                      <span
                        className="grid size-[34px] shrink-0 place-items-center rounded-md"
                        style={{
                          color: o.state === "OVERDUE" ? "var(--color-danger)" : "var(--color-cat-6)",
                          background: `color-mix(in oklab, ${o.state === "OVERDUE" ? "var(--color-danger)" : "var(--color-cat-6)"} 11%, transparent)`,
                        }}
                        aria-hidden
                      >
                        <IconZap size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-base lg:text-sm">{o.billName}</span>
                          {o.isEstimate ? <Badge>estimated</Badge> : null}
                          {o.autoPay ? <Badge tone="info">auto-pay</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-ink-tertiary">
                          {relativeDay(o.daysUntil)} · {formatDate(o.dueOn)} · {o.accountName}
                          {o.categoryName ? ` · ${o.categoryName}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Amount value={o.expected} size="md" sign="never" />
                        {o.isEstimate ? (
                          <span className="block text-2xs text-ink-tertiary">estimate</span>
                        ) : null}
                      </span>
                      <PayBillButton
                        occurrenceId={o.id}
                        billName={o.billName}
                        expected={o.expected.decimal}
                        currency={o.expected.currency}
                        accounts={payableAccounts}
                        defaultAccountId={o.accountId}
                        today={todayInTimezone(actor.timezone)}
                      />
                    </div>
                  ))}
                </Panel>
              </section>
            ) : null,
          )}

          {paid.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Paid recently" meta={`${paid.length}`} />
              <Panel className="opacity-80">
                {paid.slice(0, 8).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0"
                  >
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-inflow-wash text-inflow">
                      <IconCheck size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{o.billName}</span>
                      <span className="block truncate text-xs text-ink-tertiary">
                        Paid · due {formatDate(o.dueOn)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Amount value={o.paid ?? o.expected} size="sm" sign="never" />
                      {o.paid && o.paid.decimal !== o.expected.decimal ? (
                        <span className="block text-2xs text-ink-tertiary">
                          est. {o.expected.decimal}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </Panel>
            </section>
          ) : null}

          {paid.length > 2 ? (
            <section className="mt-6">
              <Panel>
                <PanelHead title="Estimate accuracy" action="Paid vs estimated" />
                <PanelBody>
                  <BarSeries
                    data={paid
                      .slice(-12)
                      .map((o) => ({
                        label: formatShort(o.dueOn),
                        value: Number((o.paid ?? o.expected).decimal),
                        tone:
                          o.paid && Number(o.paid.decimal) > Number(o.expected.decimal) * 1.15
                            ? ("warning" as const)
                            : ("transfer" as const),
                      }))}
                    height={90}
                    ariaLabel="Amounts actually paid, by due date"
                  />
                  <p className="mt-3 text-xs leading-relaxed text-ink-tertiary">
                    Variable bills are estimated from the trailing six payments. An estimate never
                    posts as a transaction — the ledger only moves when the bill is marked paid.
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

function inThisMonth(o: billService.BillOccurrenceDTO): boolean {
  const due = new Date(o.dueOn);
  const now = new Date();
  return due.getUTCFullYear() === now.getUTCFullYear() && due.getUTCMonth() === now.getUTCMonth();
}

function sum(
  rows: billService.BillOccurrenceDTO[],
  currency: string,
  field: "expected" | "paid" = "expected",
) {
  const minor = rows.reduce(
    (acc, r) => acc + BigInt((field === "paid" ? r.paid ?? r.expected : r.expected).minor),
    0n,
  );
  return {
    minor: minor.toString(),
    currency,
    decimal: `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`,
  };
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const formatShort = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

function relativeDay(days: number): string {
  if (days < -1) return `${Math.abs(days)} days late`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
}
