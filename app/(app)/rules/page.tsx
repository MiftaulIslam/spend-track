import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Badge, EmptyState, Panel, PanelBody } from "@/src/components/ui";
import { IconZap } from "@/src/components/icons";
import * as ruleService from "@/src/server/services/rule-service";

export const metadata = { title: "Rules" };

/**
 * Rules.
 *
 * Priority order is the page's spine, because that is the order the engine
 * evaluates in — a rule list sorted any other way would not tell you which one
 * actually wins. `appliedCount` is shown for the same reason: a rule that has
 * never fired is usually a rule whose conditions are wrong.
 */
export default async function RulesPage() {
  const actor = await requireUserPage("/rules");
  const rules = await ruleService.list(actor);

  return (
    <>
      <AppBar title="Rules" sub={`${rules.length} defined`} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {rules.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconZap />}
                title="No rules yet"
                body="Rules categorise and tag transactions automatically as they arrive — matched on description, amount, account or merchant."
              />
            </Panel>
          ) : (
            <Panel>
              <PanelBody className="px-0 pb-0">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0"
                  >
                    <span className="num w-6 shrink-0 text-xs text-ink-tertiary">
                      {rule.priority}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{rule.name}</span>
                        {rule.enabled ? null : <Badge tone="neutral">Off</Badge>}
                        {rule.stopOnMatch ? <Badge tone="info">Stops</Badge> : null}
                      </div>
                      <span className="text-2xs text-ink-tertiary">
                        {rule.conditions.length} condition
                        {rule.conditions.length === 1 ? "" : "s"} ·{" "}
                        {rule.matchAll ? "all must match" : "any may match"} · {rule.actions.length}{" "}
                        action{rule.actions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-xs">{rule.appliedCount}</div>
                      <div className="text-2xs text-ink-tertiary">applied</div>
                    </div>
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
