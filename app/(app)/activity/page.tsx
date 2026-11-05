import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Badge, EmptyState, Panel, PanelBody } from "@/src/components/ui";
import { IconHistory } from "@/src/components/icons";
import * as auditService from "@/src/server/services/audit-service";

export const metadata = { title: "Activity log" };

/**
 * Activity log.
 *
 * Reads the audit trail the services already write on every mutation. It is a
 * record, not a feed: the point is being able to answer "what changed this
 * account's balance" months later, so rows are terse and carry the actor.
 */

/** `account.create` reads better as "Account created". */
function describe(action: string): string {
  const [entity, verb] = action.split(".");
  if (!entity || !verb) return action;
  const past =
    verb === "create"
      ? "created"
      : verb === "update"
        ? "updated"
        : verb === "delete" || verb === "remove"
          ? "deleted"
          : `${verb}d`.replace(/ed d$/, "ed");
  return `${entity[0]!.toUpperCase()}${entity.slice(1)} ${past}`;
}

const ACTOR_TONE: Record<string, "brass" | "info" | "neutral"> = {
  USER: "neutral",
  AI: "brass",
  SYSTEM: "info",
  RULE: "info",
  IMPORT: "info",
  ADMIN: "brass",
};

export default async function ActivityPage() {
  const actor = await requireUserPage("/activity");
  const { items } = await auditService.list(actor, { limit: 100 });

  return (
    <>
      <AppBar title="Activity log" sub={`${items.length} recent changes`} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {items.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconHistory />}
                title="Nothing logged yet"
                body="Every change you or the assistant makes to the ledger is recorded here."
              />
            </Panel>
          ) : (
            <Panel>
              <PanelBody className="px-0 pb-0">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm">{describe(row.action)}</span>
                        <Badge tone={ACTOR_TONE[row.actorType] ?? "neutral"}>
                          {row.actorLabel ?? row.actorType.toLowerCase()}
                        </Badge>
                      </div>
                      <span className="num text-2xs text-ink-tertiary">
                        {row.entityType} · {row.entityId.slice(0, 10)}
                      </span>
                    </div>
                    <span className="num shrink-0 text-2xs text-ink-tertiary">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </PanelBody>
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}
