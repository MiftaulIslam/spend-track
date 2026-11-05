import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { ListRow } from "@/src/components/transaction-row";
import { Badge, EmptyState, LinkButton, Meter, Panel, SectionHead, Stat, StatGrid } from "@/src/components/ui";
import { IconHandshake, IconPlus } from "@/src/components/icons";
import * as lendingService from "@/src/server/services/lending-service";

export const metadata = { title: "Lending" };

/**
 * Lending.
 *
 * Money lent has left your account but is still yours; money borrowed has
 * arrived but is not income. Neither appears in spending or income totals,
 * which is exactly why this is its own surface rather than a tag on an expense.
 */
export default async function LendingPage() {
  const actor = await requireUserPage("/lending");
  const [records, summary] = await Promise.all([
    lendingService.list(actor, { includeSettled: true }),
    lendingService.summary(actor),
  ]);

  const lent = records.filter((r) => r.direction === "LENT" && isOpen(r.status));
  const borrowed = records.filter((r) => r.direction === "BORROWED" && isOpen(r.status));
  const closed = records.filter((r) => !isOpen(r.status));

  if (records.length === 0) {
    return (
      <>
        <AppBar
          title="Lending"
          actions={
            <LinkButton href="/lending/new" variant="primary" size="sm">
              <IconPlus size={15} /> Record
            </LinkButton>
          }
        />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconHandshake />}
                title="Nothing outstanding"
                body="Record money you've lent or borrowed. Repayments post against the right account, and neither side is counted as spending or income."
                action={
                  <LinkButton href="/lending/new" variant="primary" size="sm">
                    Record one
                  </LinkButton>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  const groups = [
    { title: "Owed to you", rows: lent, tone: "--color-inflow" },
    { title: "You owe", rows: borrowed, tone: "--color-outflow" },
  ];

  return (
    <>
      <AppBar
        title="Lending"
        sub={`${summary.openCount} open${summary.overdueCount ? ` · ${summary.overdueCount} overdue` : ""}`}
        actions={
          <LinkButton href="/lending/new" variant="primary" size="sm">
            <IconPlus size={15} /> Record
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <div className="mt-4">
            <StatGrid>
              <Stat
                label="Owed to you"
                value={<Amount value={summary.owedToYou} size="lg" tone="inflow" bare />}
                delta={`${lent.length} ${lent.length === 1 ? "person" : "people"}`}
              />
              <Stat
                label="You owe"
                value={<Amount value={summary.youOwe} size="lg" bare />}
                delta={`${borrowed.length} ${borrowed.length === 1 ? "person" : "people"}`}
              />
              <Stat
                label="Written off"
                value={<Amount value={summary.writtenOff} size="lg" tone="muted" bare />}
              />
              <Stat
                label="Overdue"
                value={<span className="num">{summary.overdueCount}</span>}
                tone={summary.overdueCount ? "down" : undefined}
              />
            </StatGrid>
          </div>

          {groups.map((group) =>
            group.rows.length > 0 ? (
              <section key={group.title} className="mt-6">
                <SectionHead title={group.title} meta={`${group.rows.length}`} />
                <Panel>
                  {group.rows.map((record) => (
                    <div
                      key={record.id}
                      className="flex flex-col gap-2 border-b border-rule-faint px-4 py-3 last:border-0"
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          className="grid size-[28px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold"
                          style={{
                            color: `var(${group.tone})`,
                            background: `color-mix(in oklab, var(${group.tone}) 12%, transparent)`,
                          }}
                        >
                          {initials(record.personName)}
                        </span>
                        <span className="truncate text-base lg:text-sm">{record.personName}</span>
                        {record.daysOverdue ? (
                          <Badge tone="danger">{record.daysOverdue}d overdue</Badge>
                        ) : null}
                        {record.status === "PARTIALLY_SETTLED" ? (
                          <Badge tone="info">part paid</Badge>
                        ) : null}
                        <span className="ml-auto shrink-0 text-right">
                          <Amount value={record.outstanding} size="md" sign="never" />
                          <span className="block text-2xs text-ink-tertiary">outstanding</span>
                        </span>
                      </div>
                      {record.repaidFraction > 0 ? (
                        <Meter value={record.repaidFraction} tone="ok" label={`${record.personName} repaid`} />
                      ) : null}
                      <p className="text-xs text-ink-tertiary">
                        {record.note ?? "No note"} · {record.direction === "LENT" ? "lent" : "borrowed"}{" "}
                        {formatDate(record.occurredAt)}
                        {record.paymentCount > 0
                          ? ` · ${record.repaid.decimal} of ${record.principal.decimal} repaid across ${record.paymentCount} ${record.paymentCount === 1 ? "payment" : "payments"}`
                          : " · no repayments yet"}
                      </p>
                    </div>
                  ))}
                </Panel>
              </section>
            ) : null,
          )}

          {closed.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Settled and written off" meta={`${closed.length}`} />
              <Panel className="opacity-70">
                {closed.map((record) => (
                  <ListRow
                    key={record.id}
                    icon={<span className="font-mono text-[10px] font-semibold">{initials(record.personName)}</span>}
                    tone={record.status === "WRITTEN_OFF" ? "--color-ink-tertiary" : "--color-inflow"}
                    title={record.personName}
                    sub={`${record.note ?? "—"}`}
                    right={<Amount value={record.principal} size="sm" tone="muted" sign="never" />}
                    rightSub={record.status === "WRITTEN_OFF" ? "written off" : "settled"}
                  />
                ))}
              </Panel>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}

const isOpen = (status: string): boolean => status === "OPEN" || status === "PARTIALLY_SETTLED";

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
