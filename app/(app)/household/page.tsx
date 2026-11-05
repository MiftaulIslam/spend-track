import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Badge, Callout, EmptyState, Panel, PanelBody, PanelHead } from "@/src/components/ui";
import { IconInfo, IconUsers } from "@/src/components/icons";
import * as householdService from "@/src/server/services/household-service";

export const metadata = { title: "Household" };

const ROLE_TONE: Record<string, "brass" | "info" | "neutral"> = {
  OWNER: "brass",
  ADMIN: "info",
  MEMBER: "neutral",
  VIEWER: "neutral",
};

/**
 * Household.
 *
 * Shows who can see what, which is the only question this page needs to answer
 * well. Sharing is per-record: a household member sees transactions marked
 * HOUSEHOLD and never those marked PRIVATE, so being in one is not the same as
 * handing over your ledger.
 */
export default async function HouseholdPage() {
  const actor = await requireUserPage("/household");
  const household = await householdService.get(actor);

  return (
    <>
      <AppBar
        title="Household"
        sub={household ? `${household.members.length} members` : "Not in a household"}
      />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[720px] px-4 py-6 lg:px-8">
          {!household ? (
            <Panel>
              <EmptyState
                icon={<IconUsers />}
                title="You're on your own ledger"
                body="A household lets people share the transactions they choose to mark as shared, while private ones stay private. Creating and inviting isn't wired up yet — the data model and permissions are in place."
              />
            </Panel>
          ) : (
            <>
              <Callout tone="info" icon={<IconInfo />} className="mb-6">
                Members see only what is marked shared. Anything private stays yours, including
                accounts you have not shared.
              </Callout>

              <Panel>
                <PanelHead title={household.name} action={household.baseCurrency} />
                <PanelBody className="px-0 pb-0">
                  {household.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold">
                        {(member.name ?? member.email)[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">{member.name ?? member.email}</span>
                          {member.isYou ? <Badge tone="neutral">you</Badge> : null}
                        </div>
                        <span className="truncate text-2xs text-ink-tertiary">{member.email}</span>
                      </div>
                      <Badge tone={ROLE_TONE[member.role] ?? "neutral"}>
                        {member.role.toLowerCase()}
                      </Badge>
                    </div>
                  ))}
                </PanelBody>
              </Panel>
            </>
          )}
        </div>
      </main>
    </>
  );
}
