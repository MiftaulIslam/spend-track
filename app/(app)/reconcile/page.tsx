import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { Badge, Callout, EmptyState, Panel, PanelBody, SectionHead } from "@/src/components/ui";
import { IconInfo, IconScale } from "@/src/components/icons";
import * as reconciliationService from "@/src/server/services/reconciliation-service";

export const metadata = { title: "Reconcile" };

/**
 * Reconcile.
 *
 * Two questions, in the order they matter: which accounts have drifted out of
 * date, and what did past reconciliations find. An account that has never been
 * reconciled is listed first — "never" is a longer gap than any number of days.
 */

const STATUS_TONE: Record<string, "inflow" | "warning" | "neutral"> = {
  CLOSED: "inflow",
  OPEN: "warning",
  ABANDONED: "neutral",
};

export default async function ReconcilePage() {
  const actor = await requireUserPage("/reconcile");
  const [stale, history] = await Promise.all([
    reconciliationService.staleAccounts(actor, 30),
    reconciliationService.history(actor),
  ]);

  // Never-reconciled first, then longest gap.
  const ordered = [...stale].sort((a, b) => {
    if (a.daysSince === null) return -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });

  return (
    <>
      <AppBar title="Reconcile" sub={`${ordered.length} need attention`} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          <Callout tone="info" icon={<IconInfo />} className="mb-6">
            Reconciling compares the balance this ledger computed against the balance your statement
            shows, and records the difference rather than silently overwriting it.
          </Callout>

          <section>
            <SectionHead title="Needs reconciling" meta="30+ days or never" />
            <Panel>
              {ordered.length === 0 ? (
                <EmptyState
                  icon={<IconScale />}
                  title="Everything is current"
                  body="No account has gone more than 30 days without being reconciled."
                />
              ) : (
                <PanelBody className="px-0 pb-0">
                  {ordered.map((account) => (
                    <Link
                      key={account.accountId}
                      href={`/accounts`}
                      className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0 hover:bg-sunken"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm">{account.name}</span>
                        <span className="mt-0.5 block text-2xs text-ink-tertiary">
                          {account.daysSince === null
                            ? "Never reconciled"
                            : `${account.daysSince} days since last`}
                        </span>
                      </div>
                      {account.daysSince === null ? <Badge tone="warning">never</Badge> : null}
                      <Amount value={account.balance} />
                    </Link>
                  ))}
                </PanelBody>
              )}
            </Panel>
          </section>

          <section className="mt-8">
            <SectionHead title="History" meta={`${history.length} recorded`} />
            <Panel>
              {history.length === 0 ? (
                <EmptyState
                  icon={<IconScale />}
                  title="No reconciliations yet"
                  body="Once you reconcile an account, each session is kept here with the difference it found."
                />
              ) : (
                <PanelBody className="px-0 pb-0">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">{entry.accountName}</span>
                          <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>
                            {entry.status.toLowerCase()}
                          </Badge>
                        </div>
                        <span className="text-2xs text-ink-tertiary">
                          Statement {new Date(entry.statementDate).toLocaleDateString()} ·{" "}
                          {entry.clearedCount} cleared
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <Amount value={entry.difference} />
                        <div className="text-2xs text-ink-tertiary">difference</div>
                      </div>
                    </div>
                  ))}
                </PanelBody>
              )}
            </Panel>
          </section>
        </div>
      </main>
    </>
  );
}
