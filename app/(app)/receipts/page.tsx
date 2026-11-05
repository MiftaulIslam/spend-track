import Link from "next/link";
import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Amount } from "@/src/components/money";
import { Badge, EmptyState, Panel, PanelBody } from "@/src/components/ui";
import { IconCamera } from "@/src/components/icons";
import * as receiptService from "@/src/server/services/receipt-service";

export const metadata = { title: "Receipts" };

const STATUS_TONE: Record<string, "inflow" | "warning" | "danger" | "neutral"> = {
  MATCHED: "inflow",
  EXTRACTED: "inflow",
  PROCESSING: "warning",
  PENDING: "warning",
  FAILED: "danger",
};

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Receipts.
 *
 * Sorted newest first and flagged by whether they are attached to a
 * transaction, because an unmatched receipt is the only kind that needs you to
 * do something about it.
 */
export default async function ReceiptsPage() {
  const actor = await requireUserPage("/receipts");
  const [items, counts] = await Promise.all([
    receiptService.list(actor),
    receiptService.counts(actor),
  ]);

  return (
    <>
      <AppBar
        title="Receipts"
        sub={
          counts.total === 0 ? "None yet" : `${counts.total} stored · ${counts.unmatched} unmatched`
        }
      />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {items.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconCamera />}
                title="No receipts yet"
                body="Photograph a receipt and the assistant reads the merchant, total and date off it, then matches it to a transaction. Capture isn't wired up yet — storage, extraction and matching are."
              />
            </Panel>
          ) : (
            <Panel>
              <PanelBody className="px-0 pb-0">
                {items.map((receipt) => {
                  const row = (
                    <div className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">
                            {receipt.merchantName ?? receipt.filename}
                          </span>
                          <Badge tone={STATUS_TONE[receipt.status] ?? "neutral"}>
                            {receipt.status.toLowerCase()}
                          </Badge>
                          {receipt.transactionId ? null : <Badge tone="warning">unmatched</Badge>}
                        </div>
                        <span className="text-2xs text-ink-tertiary">
                          {receipt.purchasedAt
                            ? new Date(receipt.purchasedAt).toLocaleDateString()
                            : new Date(receipt.createdAt).toLocaleDateString()}{" "}
                          · {fileSize(receipt.sizeBytes)}
                          {receipt.confidence !== null
                            ? ` · ${Math.round(receipt.confidence * 100)}% confident`
                            : ""}
                        </span>
                      </div>
                      {receipt.total ? <Amount value={receipt.total} /> : null}
                    </div>
                  );

                  return receipt.transactionId ? (
                    <Link
                      key={receipt.id}
                      href={`/transactions/${receipt.transactionId}`}
                      className="block hover:bg-sunken"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={receipt.id}>{row}</div>
                  );
                })}
              </PanelBody>
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}
