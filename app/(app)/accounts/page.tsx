import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount, Percent } from "@/src/components/money";
import { ListRow } from "@/src/components/transaction-row";
import {
  Badge,
  Callout,
  EmptyState,
  LinkButton,
  Meter,
  Panel,
  SectionHead,
  Stat,
  StatGrid,
} from "@/src/components/ui";
import {
  IconAlert,
  IconChart,
  IconPlus,
  IconReceipt,
  IconTrendDown,
  IconWallet,
} from "@/src/components/icons";
import * as accountService from "@/src/server/services/account-service";

export const metadata = { title: "Accounts" };

/**
 * Accounts.
 *
 * Grouped by what each account *is* rather than alphabetically, because "how
 * much liquid cash do I have" and "how much do I owe" are the two questions
 * this page exists to answer. Liability balances are shown as the positive
 * amount owed, which is what the statement says.
 */

const GROUPS = [
  { label: "Cash & banking", types: ["CASH", "CHECKING", "SAVINGS"], Icon: IconWallet },
  {
    label: "Cards",
    types: ["CREDIT_CARD", "DEBIT_CARD", "PREPAID", "DIGITAL_WALLET"],
    Icon: IconReceipt,
  },
  { label: "Investments", types: ["INVESTMENT"], Icon: IconChart },
  { label: "Loans & liabilities", types: ["LOAN", "LIABILITY"], Icon: IconTrendDown },
  { label: "Other", types: ["OTHER"], Icon: IconWallet },
] as const;

export default async function AccountsPage(props: PageProps<"/accounts">) {
  const actor = await requireUserPage("/accounts");
  const params = await props.searchParams;
  const includeArchived = params.archived === "true";

  const accounts = await accountService.list(actor, { includeArchived });
  const netWorth = await accountService.netWorth(actor);

  const active = accounts.filter((a) => !a.archivedAt);
  const archivedCount = accounts.length - active.length;
  const needsReconcile = active.filter((a) => a.needsReconcile);

  const liquid = active
    .filter((a) => ["CASH", "CHECKING", "SAVINGS", "PREPAID", "DIGITAL_WALLET"].includes(a.type))
    .reduce((acc, a) => acc + BigInt(a.balanceBase.minor), 0n);

  if (active.length === 0) {
    return (
      <>
        <AppBar title="Accounts" />
        <main className="mb-tabbar flex-1 lg:mb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
            <Panel className="mt-6">
              <EmptyState
                icon={<IconWallet />}
                title="No accounts yet"
                body="Add the accounts you actually use. Nothing connects to a bank — you enter balances yourself, or import a statement."
                action={
                  <>
                    <LinkButton href="/accounts/new" variant="primary" size="sm">
                      Add an account
                    </LinkButton>
                    <LinkButton href="/import" size="sm">
                      Import a statement
                    </LinkButton>
                  </>
                }
              />
            </Panel>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="Accounts"
        sub={`${active.length} open${needsReconcile.length ? ` · ${needsReconcile.length} need reconciling` : ""}`}
        actions={
          <LinkButton href="/accounts/new" variant="primary" size="sm">
            <IconPlus size={15} />
            Add
          </LinkButton>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
          <div className="mt-4">
            <StatGrid>
              <Stat
                label="Assets"
                value={<Amount value={netWorth.assets} size="lg" bare />}
                delta={`${active.filter((a) => !a.isLiability).length} accounts`}
              />
              <Stat
                label="Owing"
                value={<Amount value={netWorth.liabilities} size="lg" bare />}
                delta={`${active.filter((a) => a.isLiability).length} accounts`}
              />
              <Stat label="Net worth" value={<Amount value={netWorth.net} size="lg" bare />} />
              <Stat
                label="Liquid"
                value={
                  <Amount
                    value={{
                      minor: liquid.toString(),
                      currency: actor.baseCurrency,
                      decimal: `${liquid / 100n}.${String(liquid % 100n).padStart(2, "0")}`,
                    }}
                    size="lg"
                    bare
                  />
                }
                delta="available now"
              />
            </StatGrid>
          </div>

          {needsReconcile.length > 0 ? (
            <Callout tone="warning" icon={<IconAlert />} className="mt-4">
              <b>{needsReconcile[0].name}</b> hasn&rsquo;t been reconciled in a while — the recorded
              balance is <Amount value={needsReconcile[0].balance} size="sm" />.{" "}
              <Link href={`/reconcile?account=${needsReconcile[0].id}`}>Reconcile now</Link>
            </Callout>
          ) : null}

          {GROUPS.map((group) => {
            const rows = active.filter((a) => group.types.includes(a.type as never));
            if (rows.length === 0) return null;

            const subtotal = rows.reduce((acc, a) => acc + BigInt(a.balanceBase.minor), 0n);

            return (
              <section key={group.label} className="mt-6">
                <SectionHead
                  title={group.label}
                  meta={
                    <Amount
                      value={{
                        minor: subtotal.toString(),
                        currency: actor.baseCurrency,
                        decimal: `${subtotal < 0n ? "-" : ""}${(subtotal < 0n ? -subtotal : subtotal) / 100n}.${String((subtotal < 0n ? -subtotal : subtotal) % 100n).padStart(2, "0")}`,
                      }}
                      size="sm"
                      tone="muted"
                    />
                  }
                />
                <Panel>
                  {rows.map((account) => (
                    <ListRow
                      key={account.id}
                      href={`/accounts/${account.id}`}
                      icon={<group.Icon size={16} />}
                      tone={`--color-cat-${(((account.colorIndex ?? 12) - 1) % 12) + 1}`}
                      title={account.name}
                      sub={
                        <>
                          {titleCase(account.type)}
                          {account.mask ? ` · ···${account.mask}` : ""}
                          {` · ${account.currency}`}
                          {account.institution ? ` · ${account.institution}` : ""}
                        </>
                      }
                      badge={
                        account.needsReconcile ? (
                          <Badge tone="warning">reconcile</Badge>
                        ) : account.visibility === "HOUSEHOLD" ? (
                          <Badge tone="info">shared</Badge>
                        ) : null
                      }
                      right={
                        <Amount
                          value={account.isLiability ? account.owed : account.balance}
                          size="md"
                          tone={
                            account.isLiability
                              ? "outflow"
                              : BigInt(account.balance.minor) < 0n
                                ? "outflow"
                                : "default"
                          }
                          sign="never"
                        />
                      }
                      rightSub={
                        account.utilisation !== null ? (
                          <>
                            <Percent value={account.utilisation} digits={0} /> of limit
                          </>
                        ) : account.currency !== actor.baseCurrency ? (
                          <>
                            ≈ {account.balanceBase.decimal} {actor.baseCurrency}
                          </>
                        ) : account.interestRateBps ? (
                          <>{(account.interestRateBps / 100).toFixed(2)}% APY</>
                        ) : null
                      }
                    />
                  ))}
                </Panel>

                {/* Utilisation is the one credit metric worth surfacing in a list:
                    it is the thing that quietly affects a credit score. */}
                {group.label === "Cards"
                  ? rows
                      .filter((a) => a.utilisation !== null && a.creditLimit)
                      .map((a) => (
                        <div key={`${a.id}-util`} className="mt-2 px-1">
                          <div className="mb-1 flex text-2xs text-ink-tertiary">
                            <span>{a.name} utilisation</span>
                            <span className="num ml-auto">
                              {Math.round((a.utilisation ?? 0) * 100)}% of {a.creditLimit?.decimal}
                            </span>
                          </div>
                          <Meter
                            value={a.utilisation ?? 0}
                            mark={0.3}
                            tone={(a.utilisation ?? 0) > 0.3 ? "warn" : "ok"}
                            label={`${a.name} credit utilisation`}
                          />
                        </div>
                      ))
                  : null}
              </section>
            );
          })}

          {archivedCount > 0 || includeArchived ? (
            <p className="mt-6 text-center text-xs text-ink-tertiary">
              {includeArchived ? (
                <Link href="/accounts" className="underline underline-offset-2">
                  Hide archived accounts
                </Link>
              ) : (
                <>
                  {archivedCount} archived {archivedCount === 1 ? "account" : "accounts"} hidden.{" "}
                  <Link href="/accounts?archived=true" className="underline underline-offset-2">
                    Show them
                  </Link>
                </>
              )}
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}

const titleCase = (s: string): string =>
  s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
