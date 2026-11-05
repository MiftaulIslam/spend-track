import Link from "next/link";
import { todayInTimezone } from "@/src/domain/datetime";
import { Suspense } from "react";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { DayHeader, TransactionRow, groupByDay } from "@/src/components/transaction-row";
import { EmptyState, ListSkeleton, Panel } from "@/src/components/ui";
import { IconFilter, IconList, IconSearch } from "@/src/components/icons";
import * as transactionService from "@/src/server/services/transaction-service";
import * as categoryService from "@/src/server/services/category-service";
import * as accountService from "@/src/server/services/account-service";
import { transactionFilterSchema } from "@/src/lib/schemas";
import { FilterChips, LoadMore, SearchField } from "./client";

export const metadata = { title: "Transactions" };

/**
 * The ledger.
 *
 * Filters live in the URL, so a filtered view is shareable, survives a reload,
 * and is a server round-trip rather than client state — which matters because
 * filtering 200,000 rows has to happen in Postgres.
 */
export default async function TransactionsPage(props: PageProps<"/transactions">) {
  const actor = await requireUserPage("/transactions");
  const params = await props.searchParams;

  const filter = transactionFilterSchema.parse({
    search: str(params.search),
    accountIds: arr(params.account),
    categoryIds: arr(params.category),
    types: arr(params.type),
    dateFrom: str(params.from),
    dateTo: str(params.to),
    uncategorised: params.uncategorised === "true" ? true : undefined,
    needsReview: params.needsReview === "true" ? true : undefined,
    includeTransfers: params.transfers !== "false",
    sort: (str(params.sort) as "date_desc") ?? "date_desc",
    limit: 50,
  });

  const [accounts, categories] = await Promise.all([
    accountService.list(actor),
    categoryService.flat(actor, {}),
  ]);

  return (
    <>
      <AppBar
        title="Transactions"
        sub={
          <Suspense fallback="Loading…">
            <CountLabel filter={filter} />
          </Suspense>
        }
        actions={
          <>
            <Link
              href="/transactions?needsReview=true"
              className="grid size-9 place-items-center rounded-md text-ink-secondary hover:bg-rule-faint"
              aria-label="Needs review"
            >
              <IconFilter size={18} />
            </Link>
          </>
        }
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="px-4 pt-3 lg:px-8">
          <SearchField initial={filter.search ?? ""} />
        </div>

        <FilterChips
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, label: c.label }))}
        />

        <div className="mx-auto w-full max-w-[1320px]">
          <Suspense
            key={JSON.stringify(params)}
            fallback={
              <Panel flush className="mt-2">
                <ListSkeleton rows={10} />
              </Panel>
            }
          >
            <Ledger filter={filter} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

async function CountLabel({
  filter,
}: {
  filter: ReturnType<typeof transactionFilterSchema.parse>;
}) {
  const actor = await requireUserPage();
  const totals = await transactionService.totals(
    actor,
    filter.dateFrom ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)),
    filter.dateTo ?? new Date(),
  );
  return <>{totals.count.toLocaleString()} this month</>;
}

async function Ledger({ filter }: { filter: ReturnType<typeof transactionFilterSchema.parse> }) {
  const actor = await requireUserPage();
  const page = await transactionService.list(actor, filter);

  if (page.items.length === 0) {
    return (
      <Panel flush className="mt-2">
        <EmptyState
          icon={filter.search ? <IconSearch /> : <IconList />}
          title={filter.search ? `No matches for “${filter.search}”` : "No transactions yet"}
          body={
            filter.search
              ? "Check the spelling, or clear the filters to search everything."
              : "Add your first expense and SpendTrack starts learning your merchants and categories."
          }
          action={
            filter.search || filter.needsReview || filter.uncategorised ? (
              <Link
                href="/transactions"
                className="inline-flex h-8 items-center rounded-md border border-rule-strong bg-surface px-3 text-sm font-medium"
              >
                Clear filters
              </Link>
            ) : null
          }
        />
      </Panel>
    );
  }

  const days = groupByDay(page.items, todayInTimezone(actor.timezone));

  return (
    <>
      {/* The running totals for the visible window, so a filtered view still
          answers "how much is this". */}
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2 text-xs text-ink-tertiary lg:px-8">
        <span>Showing {page.items.length.toLocaleString()} transactions</span>
        <span className="ml-auto flex gap-3">
          <span>
            Out <Amount value={sumOf(page.items, "spending")} size="sm" bare />
          </span>
          <span>
            In <Amount value={sumOf(page.items, "income")} size="sm" tone="inflow" bare />
          </span>
        </span>
      </div>

      {/* Desktop column headers — the mobile layout puts these in the subtitle. */}
      <div className="hidden grid-cols-[30px_minmax(0,1fr)_150px_130px_110px] gap-3 border-b border-rule px-4 py-2 lg:grid lg:px-8">
        <span />
        <span className="eyebrow">Description</span>
        <span className="eyebrow">Category</span>
        <span className="eyebrow">Account</span>
        <span className="eyebrow text-right">Amount</span>
      </div>

      {days.map((day) => (
        <section key={day.key} className="border-t border-rule first:border-t-0">
          <DayHeader
            date={day.label}
            total={<Amount value={day.net} size="sm" tone="muted" sign="always" />}
          />
          <div className="stagger">
            {day.items.map((txn, i) => (
              <div key={txn.id} style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                <TransactionRow txn={txn} href={`/transactions/${txn.id}`} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {page.hasMore ? (
        <LoadMore cursor={page.nextCursor} />
      ) : (
        <p className="py-8 text-center text-xs text-ink-tertiary">That&rsquo;s everything.</p>
      )}
    </>
  );
}

function sumOf(items: transactionService.TransactionDTO[], kind: "spending" | "income") {
  let minor = 0n;
  const currency = items[0]?.amountBase.currency ?? "USD";
  for (const item of items) {
    if (kind === "spending" && item.isSpending) minor += BigInt(item.amountBase.minor);
    if (kind === "income" && item.isIncome) minor += BigInt(item.amountBase.minor);
  }
  const whole = (minor / 100n).toString();
  const frac = (minor % 100n).toString().padStart(2, "0");
  return { minor: minor.toString(), currency, decimal: `${whole}.${frac}` };
}

const str = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const arr = (v: string | string[] | undefined): string[] | undefined => {
  if (!v) return undefined;
  const list = Array.isArray(v) ? v : v.split(",");
  return list.filter(Boolean);
};
