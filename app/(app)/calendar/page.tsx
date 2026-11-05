import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { Badge, EmptyState, Panel, PanelBody, SectionHead } from "@/src/components/ui";
import { IconCalendar } from "@/src/components/icons";
import * as billService from "@/src/server/services/bill-service";
import { addDays } from "@/src/domain/schedule";

export const metadata = { title: "Calendar" };

/**
 * Calendar.
 *
 * A month grid would look more like a calendar and tell you less: what matters
 * about a due date is what lands that day and whether the account covers it.
 * So this groups by day, in order, and only shows days that have something —
 * an empty Tuesday is not information.
 */

const DAY_MS = 86_400_000;

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const days = Math.round(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) /
      DAY_MS,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

const STATE_TONE: Record<string, "danger" | "warning" | "inflow" | "neutral"> = {
  OVERDUE: "danger",
  DUE: "warning",
  PAID: "inflow",
  SKIPPED: "neutral",
  SCHEDULED: "neutral",
};

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const actor = await requireUserPage("/calendar");
  const params = await props.searchParams;
  const days = Number(typeof params.days === "string" ? params.days : "45") || 45;

  const from = addDays(new Date(), -7);
  const to = addDays(new Date(), days);
  const occurrences = await billService.occurrencesInRange(actor, from, to);

  // Group by due date; the service returns them ordered, so insertion order is
  // already chronological.
  const byDay = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const key = occurrence.dueOn.slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(occurrence);
    else byDay.set(key, [occurrence]);
  }

  return (
    <>
      <AppBar
        title="Calendar"
        sub={`${occurrences.length} dated items · next ${days} days`}
        actions={
          <Link href="/bills" className="text-xs font-medium text-ink-secondary hover:text-ink">
            Bills
          </Link>
        }
      />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {occurrences.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconCalendar />}
                title="Nothing dated"
                body="Bills and recurring transactions with a due date show up here, grouped by day."
              />
            </Panel>
          ) : (
            <div className="flex flex-col gap-6">
              {[...byDay.entries()].map(([day, items]) => (
                <section key={day}>
                  <SectionHead
                    title={dayLabel(day)}
                    meta={`${items.length} item${items.length === 1 ? "" : "s"}`}
                  />
                  <Panel>
                    <PanelBody className="px-0 pb-0">
                      {items.map((occurrence) => (
                        <div
                          key={occurrence.id}
                          className="flex items-center gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm">{occurrence.billName}</span>
                              <Badge tone={STATE_TONE[occurrence.state] ?? "neutral"}>
                                {occurrence.state.toLowerCase()}
                              </Badge>
                              {occurrence.autoPay ? <Badge tone="info">auto</Badge> : null}
                            </div>
                            <span className="text-2xs text-ink-tertiary">
                              {occurrence.accountName}
                              {occurrence.categoryName ? ` · ${occurrence.categoryName}` : ""}
                              {occurrence.isEstimate ? " · estimated" : ""}
                            </span>
                          </div>
                          <Amount value={occurrence.paid ?? occurrence.expected} />
                        </div>
                      ))}
                    </PanelBody>
                  </Panel>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
