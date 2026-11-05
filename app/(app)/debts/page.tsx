import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import {
  Badge, Callout, EmptyState, LinkButton, Meter, Panel, PanelBody,
  SectionHead, Stat, StatGrid, Table, Td, Th,
} from "@/src/components/ui";
import { IconInfo, IconPlus, IconTrendDown } from "@/src/components/icons";
import * as debtService from "@/src/server/services/debt-service";

export const metadata = { title: "Debt" };

/**
 * Debt.
 *
 * The avalanche-versus-snowball comparison is the reason this page exists. Both
 * come from exact amortisation, so the trade-off it shows — "snowball costs
 * $412 more but clears your first account four months sooner" — is a fact
 * rather than a rule of thumb.
 */
export default async function DebtsPage(props: PageProps<"/debts">) {
  const actor = await requireUserPage("/debts");
  const params = await props.searchParams;
  const monthlyBudget = typeof params.budget === "string" ? params.budget : undefined;

  const [debts, plans] = await Promise.all([
    debtService.list(actor),
    debtService.payoffPlans(actor, monthlyBudget),
  ]);

  if (debts.length === 0) {
    return (
      <>
        <AppBar
          title="Debt"
          actions={
            <LinkButton href="/debts/new" variant="primary" size="sm">
              <IconPlus size={15} /> Debt
            </LinkButton>
          }
        />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconTrendDown />}
                title="No debt recorded"
                body="Add a loan or a card balance and SpendTrack works out the payoff date, the total interest, and whether avalanche or snowball suits you better."
                action={
                  <LinkButton href="/debts/new" variant="primary" size="sm">
                    Add a debt
                  </LinkButton>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  const avalanche = plans.plans.find((p) => p.strategy === "AVALANCHE");
  const snowball = plans.plans.find((p) => p.strategy === "SNOWBALL");
  const interestGap =
    avalanche && snowball
      ? Number(snowball.totalInterest.decimal) - Number(avalanche.totalInterest.decimal)
      : 0;
  const monthGap = avalanche && snowball ? snowball.months - avalanche.months : 0;

  return (
    <>
      <AppBar
        title="Debt"
        sub={`${debts.length} ${debts.length === 1 ? "account" : "accounts"} · ${plans.totalBalance.decimal} ${actor.baseCurrency}`}
        actions={
          <LinkButton href="/debts/new" variant="primary" size="sm">
            <IconPlus size={15} /> Debt
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <section className="pt-5 pb-4">
            <div className="eyebrow">Total owed</div>
            <div className="mt-2">
              <Amount value={plans.totalBalance} size="display" />
            </div>
            <p className="mt-2 text-xs text-ink-tertiary">
              Weighted APR {(plans.weightedAprBps / 100).toFixed(2)}% · minimums{" "}
              <Amount value={plans.minimumRequired} size="sm" tone="muted" /> a month
            </p>
          </section>

          <StatGrid>
            <Stat
              label="Minimum payment"
              value={<Amount value={plans.minimumRequired} size="lg" bare />}
              delta="per month"
            />
            <Stat
              label="Debt-free"
              value={avalanche ? formatMonth(avalanche.payoffDate) : "—"}
              delta={avalanche ? `${avalanche.months} months` : undefined}
            />
            <Stat
              label="Total interest"
              value={avalanche ? <Amount value={avalanche.totalInterest} size="lg" bare /> : "—"}
              delta="on this plan"
            />
            <Stat label="Accounts" value={<span className="num">{debts.length}</span>} />
          </StatGrid>

          {interestGap !== 0 && monthGap !== 0 ? (
            <Callout tone="info" icon={<IconInfo />} className="mt-4">
              Avalanche pays the highest rate first and saves{" "}
              <b>
                {Math.abs(interestGap).toFixed(2)} {actor.baseCurrency}
              </b>{" "}
              in interest. Snowball clears your smallest balance first, which some people find
              easier to stick to — it costs {Math.abs(monthGap)}{" "}
              {Math.abs(monthGap) === 1 ? "month" : "months"} more overall.
            </Callout>
          ) : null}

          <section className="mt-6">
            <SectionHead
              title="Payoff strategies"
              meta={`at ${plans.plans[0]?.monthlyBudget.decimal ?? "—"} a month`}
            />
            <Panel>
              <Table>
                <thead>
                  <tr>
                    <Th>Strategy</Th>
                    <Th numeric>Months</Th>
                    <Th>Debt-free</Th>
                    <Th numeric>Interest</Th>
                    <Th>Order</Th>
                  </tr>
                </thead>
                <tbody>
                  {plans.plans.map((plan) => (
                    <tr key={plan.strategy}>
                      <Td>
                        {titleCase(plan.strategy)}
                        {plan.strategy === "AVALANCHE" ? (
                          <Badge tone="inflow" className="ml-2">
                            cheapest
                          </Badge>
                        ) : null}
                      </Td>
                      <Td numeric>{plan.months}</Td>
                      <Td>{formatMonth(plan.payoffDate)}</Td>
                      <Td numeric>
                        <Amount value={plan.totalInterest} size="sm" bare />
                      </Td>
                      <Td className="text-xs text-ink-tertiary">
                        {plan.order.map((o) => o.name).join(" → ")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <PanelBody className="pt-3">
                <p className="text-xs leading-relaxed text-ink-tertiary">
                  Amortisation uses exact integer-cent arithmetic, so each schedule&rsquo;s payments
                  sum back to the principal plus interest to the cent.
                </p>
              </PanelBody>
            </Panel>
          </section>

          <section className="mt-6">
            <SectionHead title="Accounts" />
            <Panel>
              {debts.map((debt) => (
                <div
                  key={debt.id}
                  className="flex flex-col gap-2 border-b border-rule-faint px-4 py-3 last:border-0"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-base lg:text-sm">{debt.name}</span>
                    <Badge
                      tone={debt.aprPercent > 15 ? "danger" : debt.aprPercent > 5 ? "warning" : "neutral"}
                    >
                      {debt.aprPercent.toFixed(2)}% APR
                    </Badge>
                    <span className="ml-auto shrink-0">
                      <Amount value={debt.balance} size="md" sign="never" />
                    </span>
                  </div>
                  <Meter value={debt.paidFraction} tone="ok" label={`${debt.name} paid off`} />
                  <div className="flex flex-wrap gap-x-3 text-xs text-ink-tertiary">
                    <span>
                      <Amount value={debt.paid} size="sm" tone="muted" bare /> of{" "}
                      <Amount value={debt.principal} size="sm" tone="muted" bare /> repaid
                    </span>
                    <span>
                      · interest <Amount value={debt.monthlyInterest} size="sm" tone="muted" bare /> a month
                    </span>
                    <span>
                      · minimum <Amount value={debt.minimumPayment} size="sm" tone="muted" bare />
                    </span>
                    {debt.minimumPayoff ? (
                      <span className="lg:ml-auto">
                        At minimums: {debt.minimumPayoff.months} months,{" "}
                        <Amount value={debt.minimumPayoff.totalInterest} size="sm" tone="muted" bare />{" "}
                        interest
                      </span>
                    ) : (
                      <span className="text-danger lg:ml-auto">
                        The minimum never clears this balance
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Panel>
          </section>
        </div>
      </main>
    </>
  );
}

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
const formatMonth = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
