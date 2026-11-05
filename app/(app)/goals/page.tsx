import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount, Percent } from "@/src/components/money";
import { Sparkline } from "@/src/components/charts";
import {
  Badge, Callout, Dot, EmptyState, LinkButton, Meter, Panel, PanelBody, PanelFoot,
  PanelHead, SectionHead, Stat, StatGrid,
} from "@/src/components/ui";
import { IconCheck, IconFlag, IconInfo, IconPlus } from "@/src/components/icons";
import * as goalService from "@/src/server/services/goal-service";
import { ContributeButton } from "./client";
import * as accountService from "@/src/server/services/account-service";

export const metadata = { title: "Goals" };

const PACE_TONE = {
  AHEAD: "inflow", ON_TRACK: "info", BEHIND: "warning", UNREACHABLE: "danger", COMPLETE: "inflow",
} as const;

const PACE_LABEL = {
  AHEAD: "Ahead of plan", ON_TRACK: "On track", BEHIND: "Behind plan",
  UNREACHABLE: "Deadline passed", COMPLETE: "Complete",
} as const;

/**
 * Goals.
 *
 * The lead goal gets the full treatment — progress, what the deadline demands
 * versus what the plan delivers, and milestones. The distinction between
 * "required" and "planned" contribution is the useful part: it turns "you're
 * behind" into "add $32 a month".
 */
export default async function GoalsPage() {
  const actor = await requireUserPage("/goals");
  const [goals, accounts, projection] = await Promise.all([
    goalService.list(actor, { includeCompleted: true }),
    accountService.list(actor),
    goalService.projection(actor, 12),
  ]);

  const active = goals.filter((g) => g.status === "ACTIVE" || g.status === "PAUSED");
  const done = goals.filter((g) => g.status === "COMPLETED");

  if (goals.length === 0) {
    return (
      <>
        <AppBar title="Goals" actions={<LinkButton href="/goals/new" variant="primary" size="sm"><IconPlus size={15} /> Goal</LinkButton>} />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconFlag />}
                title="No goals yet"
                body="A goal is a target with a date. Contributions are real transfers into the account you link, so the number always matches your balance."
                action={
                  <LinkButton href="/goals/new" variant="primary" size="sm">
                    Create a goal
                  </LinkButton>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  const saved = goals.reduce((acc, g) => acc + BigInt(g.saved.minor), 0n);
  const target = active.reduce((acc, g) => acc + BigInt(g.target.minor), 0n);
  const lead = active[0];

  return (
    <>
      <AppBar
        title="Goals"
        sub={`${active.length} active`}
        actions={<LinkButton href="/goals/new" variant="primary" size="sm"><IconPlus size={15} /> Goal</LinkButton>}
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <div className="mt-4">
            <StatGrid cols={4}>
              <Stat label="Saved" value={<Amount value={money(saved, actor.baseCurrency)} size="lg" bare />} delta={`across ${goals.length} goals`} />
              <Stat label="Targeting" value={<Amount value={money(target, actor.baseCurrency)} size="lg" bare />} delta={`${active.length} active`} />
              <Stat
                label="Progress"
                value={<Percent value={target > 0n ? Number(saved) / Number(target) : 0} digits={0} />}
              />
              <Stat label="Completed" value={<span className="num">{done.length}</span>} />
            </StatGrid>
          </div>

          {lead ? (
            <section className="mt-6">
              <Panel className="border-brass/30">
                <PanelHead
                  title={lead.name}
                  icon={
                    <span
                      className="grid size-[26px] place-items-center rounded-md"
                      style={{
                        color: `var(--color-cat-${((lead.colorIndex - 1) % 12) + 1})`,
                        background: `color-mix(in oklab, var(--color-cat-${((lead.colorIndex - 1) % 12) + 1}) 12%, transparent)`,
                      }}
                    >
                      <IconFlag size={15} />
                    </span>
                  }
                  action={<Badge tone={PACE_TONE[lead.pace]}>{PACE_LABEL[lead.pace]}</Badge>}
                />
                <PanelBody>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Amount value={lead.saved} size="xl" />
                    <span className="text-sm text-ink-tertiary">
                      of <Amount value={lead.target} size="sm" tone="muted" />
                    </span>
                    <span className="num ml-auto text-xs text-ink-tertiary">
                      {Math.round(lead.fraction * 100)}%
                    </span>
                  </div>

                  <div className="mt-3">
                    <Meter value={lead.fraction} tone="ok" label={`${lead.name} progress`} />
                  </div>

                  <dl className="mt-4 flex flex-wrap gap-6 text-xs">
                    {lead.contribution ? (
                      <div>
                        <dt className="eyebrow">Contributing</dt>
                        <dd className="num mt-1 m-0">
                          <Amount value={lead.contribution} size="sm" />/mo
                        </dd>
                      </div>
                    ) : null}
                    {lead.requiredPerPeriod ? (
                      <div>
                        <dt className="eyebrow">Deadline needs</dt>
                        <dd className="num mt-1 m-0">
                          <Amount value={lead.requiredPerPeriod} size="sm" />/mo
                        </dd>
                      </div>
                    ) : null}
                    {lead.projectedCompletion ? (
                      <div>
                        <dt className="eyebrow">On track for</dt>
                        <dd className="num mt-1 m-0">{formatDate(lead.projectedCompletion)}</dd>
                      </div>
                    ) : null}
                    {lead.targetDate ? (
                      <div>
                        <dt className="eyebrow">Target date</dt>
                        <dd className="num mt-1 m-0">
                          {formatDate(lead.targetDate)}
                          {lead.daysRemaining !== null ? (
                            <span className="text-ink-tertiary"> · {lead.daysRemaining}d</span>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {lead.pace === "BEHIND" && lead.requiredPerPeriod && lead.contribution ? (
                    <Callout tone="warning" icon={<IconInfo />} className="mt-4">
                      At <Amount value={lead.contribution} size="sm" />/month this lands{" "}
                      {Math.abs(lead.daysAheadOfPlan ?? 0)} days late. Raising it to{" "}
                      <Amount value={lead.requiredPerPeriod} size="sm" />/month hits the date.
                    </Callout>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ContributeButton
                      goalId={lead.id}
                      goalName={lead.name}
                      currency={lead.currency}
                      suggested={lead.contribution?.decimal ?? lead.requiredPerPeriod?.decimal ?? ""}
                      accounts={accounts
                        .filter((a) => !a.isLiability && !a.archivedAt)
                        .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
                      linkedAccountId={lead.linkedAccountId}
                    />
                    <LinkButton href={`/goals/${lead.id}`} size="sm">
                      Adjust plan
                    </LinkButton>
                  </div>
                </PanelBody>

                {lead.milestones.length > 0 ? (
                  <PanelFoot>
                    <div className="eyebrow mb-2">Milestones</div>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.milestones.map((m) => (
                        <Badge key={m.id} tone={m.reached ? "inflow" : m.fraction > 0 ? "brass" : "neutral"}>
                          {m.reached ? <IconCheck size={11} /> : null}
                          {m.name} {m.amount.decimal}
                          {!m.reached && m.fraction > 0 ? ` · ${Math.round(m.fraction * 100)}%` : ""}
                        </Badge>
                      ))}
                    </div>
                  </PanelFoot>
                ) : null}
              </Panel>
            </section>
          ) : null}

          {active.length > 1 ? (
            <section className="mt-6">
              <SectionHead title="Other goals" />
              <Panel>
                {active.slice(1).map((goal) => (
                  <Link
                    key={goal.id}
                    href={`/goals/${goal.id}`}
                    className="flex flex-col gap-2 border-b border-rule-faint px-4 py-3 last:border-0 hover:bg-rule-faint"
                  >
                    <div className="flex items-baseline gap-2">
                      <Dot index={goal.colorIndex} />
                      <span className="truncate text-base lg:text-sm">{goal.name}</span>
                      {goal.status === "PAUSED" ? <Badge>paused</Badge> : null}
                      <span className="ml-auto shrink-0 text-sm">
                        <Amount value={goal.saved} size="sm" bare />
                        <span className="text-ink-tertiary">
                          {" / "}
                          <Amount value={goal.target} size="sm" tone="muted" bare />
                        </span>
                      </span>
                    </div>
                    <Meter value={goal.fraction} tone="ok" label={`${goal.name} progress`} />
                    <div className="flex text-xs text-ink-tertiary">
                      <span>
                        {goal.linkedAccountName ?? "No linked account"}
                        {goal.targetDate ? ` · by ${formatDate(goal.targetDate)}` : ""}
                      </span>
                      <span className="num ml-auto">{Math.round(goal.fraction * 100)}%</span>
                    </div>
                  </Link>
                ))}
              </Panel>
            </section>
          ) : null}

          {done.length > 0 ? (
            <section className="mt-6">
              <SectionHead title="Completed" meta={`${done.length}`} />
              <Panel>
                {done.map((goal) => (
                  <div key={goal.id} className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-inflow-wash text-inflow">
                      <IconCheck size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{goal.name}</span>
                    <Amount value={goal.target} size="sm" tone="muted" />
                  </div>
                ))}
              </Panel>
            </section>
          ) : null}

          {projection.length > 2 ? (
            <section className="mt-6">
              <Panel>
                <PanelHead title="Projection" action="All active goals" />
                <PanelBody>
                  <Sparkline
                    points={projection.map((p) => Number(p.amount.decimal))}
                    stroke="inflow"
                    height={80}
                    ariaLabel="Projected total savings across all goals"
                  />
                  <p className="mt-3 text-xs leading-relaxed text-ink-tertiary">
                    Assumes current contribution rates continue with no withdrawals. Computed from
                    your actual contributions — never estimated by a model.
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

function money(minor: bigint, currency: string) {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return {
    minor: minor.toString(),
    currency,
    decimal: `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`,
  };
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
