import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount, Delta } from "@/src/components/money";
import {
  Badge,
  EmptyState,
  Panel,
  PanelBody,
  SectionHead,
  Stat,
  StatGrid,
} from "@/src/components/ui";
import { IconAlert, IconFile } from "@/src/components/icons";
import * as analyticsService from "@/src/server/services/analytics-service";

export const metadata = { title: "Reports" };

/**
 * Reports.
 *
 * Deliberately not a second Analytics. Analytics answers "where did this month
 * go"; this answers the two questions that need a longer lens — how this year
 * compares with last, and what happened recently that does not look like the
 * usual pattern. Both read from history, so neither belongs on a month view.
 */
export default async function ReportsPage() {
  const actor = await requireUserPage("/reports");
  const [yoy, anomalies] = await Promise.all([
    analyticsService.yearOverYear(actor),
    analyticsService.detectAnomalies(actor, { sinceDays: 30 }),
  ]);

  const thisYear = new Date().getUTCFullYear();

  return (
    <>
      <AppBar title="Reports" sub={`${thisYear} against ${thisYear - 1}`} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-6 lg:px-8">
          <section>
            <SectionHead title="Year over year" meta={`${thisYear} vs ${thisYear - 1}`} />
            <StatGrid cols={3}>
              {yoy.map((row) => (
                <Stat
                  key={row.label}
                  label={row.label}
                  value={<Amount value={row.current} />}
                  tone={row.improved ? "up" : "down"}
                  delta={
                    <>
                      <Delta
                        value={row.change}
                        goodWhen={row.label === "Expenses" ? "down" : "up"}
                      />
                      <span className="text-ink-tertiary">vs {thisYear - 1}</span>
                    </>
                  }
                />
              ))}
            </StatGrid>
          </section>

          <section className="mt-8">
            <SectionHead
              title="Unusual spending"
              meta="last 30 days"
              action={
                <Link href="/transactions" className="hover:text-ink">
                  All transactions
                </Link>
              }
            />
            <Panel>
              {anomalies.length === 0 ? (
                <EmptyState
                  icon={<IconAlert />}
                  title="Nothing out of pattern"
                  body="A charge is flagged when it is several times what this merchant usually costs you. None were in the last 30 days."
                />
              ) : (
                <PanelBody className="px-0 pb-0">
                  {anomalies.map((anomaly) => (
                    <Link
                      key={anomaly.dedupeKey}
                      href={`/transactions/${anomaly.transactionId}`}
                      className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0 hover:bg-sunken"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">
                            {anomaly.merchantName ?? anomaly.description}
                          </span>
                          <Badge tone="warning">{anomaly.multiple.toFixed(1)}× usual</Badge>
                        </div>
                        <span className="text-2xs text-ink-tertiary">
                          {new Date(anomaly.occurredAt).toLocaleDateString()} · {anomaly.reason}
                        </span>
                      </div>
                      <Amount value={anomaly.amount} />
                    </Link>
                  ))}
                </PanelBody>
              )}
            </Panel>
          </section>

          <section className="mt-8">
            <SectionHead title="Export" />
            <Panel>
              <EmptyState
                icon={<IconFile />}
                title="Export isn't built yet"
                body="Your data is yours and will be exportable as CSV and JSON. The ledger, categories and attachments are all stored locally in your database in the meantime."
              />
            </Panel>
          </section>
        </div>
      </main>
    </>
  );
}
