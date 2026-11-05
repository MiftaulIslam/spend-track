import Link from "next/link";
import { presentAmount } from "@/src/domain/ledger";
import { notFound } from "next/navigation";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { Badge, Callout, Dot, Panel, PanelBody, PanelHead, SectionHead } from "@/src/components/ui";
import { CategoryIcon, IconCheck, IconInfo, IconReceipt, IconSparkle } from "@/src/components/icons";
import * as transactionService from "@/src/server/services/transaction-service";
import * as audit from "@/src/server/services/audit-service";
import { NotFoundError } from "@/src/server/errors";
import { TransactionActions } from "./client";

export const metadata = { title: "Transaction" };

/**
 * One transaction, in full.
 *
 * Includes the audit trail, because "why is this categorised as Dining out"
 * is a question the product should be able to answer — and the answer is often
 * "a rule did it" or "the assistant proposed it and you confirmed".
 */
export default async function TransactionPage(props: PageProps<"/transactions/[id]">) {
  const actor = await requireUserPage();
  const { id } = await props.params;

  let txn: Awaited<ReturnType<typeof transactionService.get>>;
  try {
    txn = await transactionService.get(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const history = await audit.list(actor, { entityType: "Transaction", entityId: id, limit: 20 });

  const { tone, sign } = presentAmount(txn);

  return (
    <>
      <AppBar
        title={txn.description ?? txn.merchantName ?? txn.typeLabel}
        sub={`${txn.categoryName ?? "Uncategorised"} · ${formatDate(txn.occurredAt)}`}
        back="/transactions"
      />

      <main className="mb-tabbar flex-1 lg:mb-0 lg:pb-12">
        <div className="mx-auto w-full max-w-[760px] px-4 lg:px-8">
          <section className="border-b border-rule py-6 text-center">
            <div
              className="mx-auto mb-3 grid size-12 place-items-center rounded-md"
              style={{
                color: `var(--color-cat-${(((txn.categoryColor ?? 12) - 1) % 12) + 1})`,
                background: `color-mix(in oklab, var(--color-cat-${(((txn.categoryColor ?? 12) - 1) % 12) + 1}) 11%, transparent)`,
              }}
              aria-hidden
            >
              <CategoryIcon size={22} />
            </div>
            <Amount
              value={txn.amount}
              size="display"
              tone={tone}
              sign={sign}
            />
            {txn.fx ? (
              <p className="num mt-1 text-xs text-ink-tertiary">
                {txn.amountBase.decimal} {txn.amountBase.currency} at {Number(txn.fx.rate).toFixed(4)}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <Badge tone={txn.isIncome ? "inflow" : txn.isTransfer ? "transfer" : "outflow"}>
                {txn.typeLabel}
              </Badge>
              <Badge tone={txn.status === "PENDING" ? "warning" : txn.status === "RECONCILED" ? "inflow" : "neutral"}>
                {titleCase(txn.status)}
              </Badge>
              {txn.isSplit ? <Badge tone="info">Split {txn.splitCount} ways</Badge> : null}
              {txn.excludeFromBudget ? <Badge>Excluded from budgets</Badge> : null}
              {txn.createdVia !== "MANUAL" ? <Badge>{titleCase(txn.createdVia)}</Badge> : null}
            </div>
          </section>

          {!txn.isSpending && !txn.isIncome ? (
            <Callout tone="info" icon={<IconInfo />} className="mt-4">
              {txn.isTransfer
                ? "This moves money between your own accounts, so it doesn't count as spending or income."
                : "This is a balance-sheet movement, so it doesn't count as spending or income."}
            </Callout>
          ) : null}

          <dl className="mt-6 overflow-clip rounded-lg border border-rule bg-surface">
            <Row label="Account" value={<Link href={`/accounts/${txn.accountId}`} className="underline underline-offset-2">{txn.accountName}</Link>} />
            <Row
              label="Category"
              value={
                txn.categoryName ? (
                  <span className="flex items-center gap-2">
                    <Dot index={txn.categoryColor ?? 12} />
                    {txn.categoryName}
                  </span>
                ) : (
                  <span className="text-ink-tertiary">Uncategorised</span>
                )
              }
            />
            {txn.merchantName ? <Row label="Merchant" value={txn.merchantName} /> : null}
            <Row label="Date" value={<span className="num">{formatDateTime(txn.occurredAt)}</span>} />
            {txn.tags.length > 0 ? (
              <Row
                label="Tags"
                value={
                  <span className="flex flex-wrap gap-1">
                    {txn.tags.map((t) => (
                      <Badge key={t.id}>{t.name}</Badge>
                    ))}
                  </span>
                }
              />
            ) : null}
            {txn.note ? <Row label="Note" value={<span className="whitespace-pre-wrap">{txn.note}</span>} /> : null}
          </dl>

          {txn.splits.length > 0 ? (
            <Panel className="mt-4">
              <PanelHead
                title="Split"
                action={
                  <>
                    Total <Amount value={sumSplits(txn.splits, txn.amount.currency)} size="sm" />
                  </>
                }
              />
              {txn.splits.map((split) => (
                <div key={split.id} className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-neutral-wash font-mono text-[10px] font-semibold text-ink-secondary">
                    {(split.owedByLabel ?? "You")
                      .split(" ")
                      .map((w) => w[0]?.toUpperCase() ?? "")
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{split.owedByLabel ?? "You"}</span>
                    <span className="block truncate text-xs text-ink-tertiary">
                      {split.categoryName ?? "Uncategorised"}
                      {split.note ? ` · ${split.note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Amount value={split.amount} size="sm" />
                    <span className="block text-2xs text-ink-tertiary">
                      {!split.owedByLabel ? "your share" : split.settledAt ? "settled" : "outstanding"}
                    </span>
                  </span>
                </div>
              ))}
            </Panel>
          ) : null}

          {txn.receipt ? (
            <Panel className="mt-4">
              <PanelHead title="Receipt" icon={<IconReceipt size={15} />} />
              <PanelBody>
                <div className="flex items-start gap-3">
                  <div className="grid h-24 w-[72px] shrink-0 place-items-center rounded-sm border border-rule bg-sunken text-ink-tertiary">
                    <IconReceipt size={20} />
                  </div>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="text-sm font-medium">{txn.receipt.merchantName ?? "Receipt"}</p>
                    {txn.receipt.total ? (
                      <p className="mt-1 text-ink-tertiary">
                        Total <Amount value={txn.receipt.total} size="sm" />
                        {txn.receipt.tax ? (
                          <>
                            {" · tax "}
                            <Amount value={txn.receipt.tax} size="sm" />
                          </>
                        ) : null}
                        {txn.receipt.tip ? (
                          <>
                            {" · tip "}
                            <Amount value={txn.receipt.tip} size="sm" />
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {txn.receipt.confidence !== null ? (
                      <Badge tone={txn.receipt.confidence > 0.8 ? "inflow" : "warning"} className="mt-2">
                        <IconCheck size={11} />
                        {Math.round(txn.receipt.confidence * 100)}% confident
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </PanelBody>
            </Panel>
          ) : null}

          <section className="mt-6">
            <SectionHead title="History" meta={`${history.items.length} events`} />
            <Panel>
              <ul className="flex flex-col gap-3 px-4 py-4 text-xs">
                {history.items.length === 0 ? (
                  <li className="text-ink-tertiary">No changes recorded.</li>
                ) : (
                  history.items.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="num w-[92px] shrink-0 text-ink-tertiary">
                        {formatShort(event.createdAt.toISOString())}
                      </span>
                      <span className="min-w-0">
                        <b className="font-medium">{event.actorLabel ?? "System"}</b>{" "}
                        {describeAction(event.action)}
                        {event.after ? (
                          <span className="num mt-0.5 block text-ink-tertiary">
                            {describeDiff(event.before, event.after)}
                          </span>
                        ) : null}
                      </span>
                      {event.actorType === "AI" ? (
                        <Badge tone="brass" className="ml-auto shrink-0">
                          <IconSparkle size={10} /> AI
                        </Badge>
                      ) : event.actorType === "RULE" ? (
                        <Badge className="ml-auto shrink-0">Rule</Badge>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </section>

          <TransactionActions
            transactionId={txn.id}
            isTransfer={txn.isTransfer}
            canRefund={txn.isSpending}
          />
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
      <dt className="w-24 shrink-0 text-xs text-ink-secondary">{label}</dt>
      <dd className="m-0 min-w-0 text-sm">{value}</dd>
    </div>
  );
}

function sumSplits(
  splits: Array<{ amount: { minor: string } }>,
  currency: string,
): { minor: string; currency: string; decimal: string } {
  const minor = splits.reduce((acc, s) => acc + BigInt(s.amount.minor), 0n);
  const whole = (minor / 100n).toString();
  const frac = (minor % 100n).toString().padStart(2, "0");
  return { minor: minor.toString(), currency, decimal: `${whole}.${frac}` };
}

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

const formatShort = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const ACTION_LABELS: Record<string, string> = {
  "transaction.create": "created this",
  "transaction.update": "changed this",
  "transaction.delete": "deleted this",
  "transaction.restore": "restored this",
  "transaction.bulk_update": "changed this in bulk",
};

const describeAction = (action: string): string => ACTION_LABELS[action] ?? action.replace(/\./g, " ");

/** Render the audit diff as "field: before → after", skipping the noise. */
function describeDiff(before: unknown, after: unknown): string {
  if (!after || typeof after !== "object") return "";
  const b = (before ?? {}) as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(a)) {
    if (key === "ids" || key === "restored") continue;
    const from = b[key];
    parts.push(from !== undefined ? `${key}: ${fmt(from)} → ${fmt(value)}` : `${key}: ${fmt(value)}`);
  }
  return parts.slice(0, 3).join(" · ");
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === "string" && /^\d+$/.test(value) && value.length > 2) {
    // Minor-unit amounts read better as money.
    return (Number(value) / 100).toFixed(2);
  }
  return String(value);
}
