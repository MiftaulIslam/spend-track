import { and, desc, eq, isNull } from "drizzle-orm";
import { db as rootDb, type Db } from "@/src/server/db";
import { attachments, receipts } from "@/src/server/db/schema";
import type { ActorContext } from "@/src/server/auth/guards";
import { money, toDTO, type MoneyDTO } from "@/src/domain/money";

/**
 * Receipts.
 *
 * A receipt is an attachment plus whatever was read out of it. The two are
 * separate rows because the file is the record of truth and the extraction is a
 * guess about it — an extraction can be wrong, re-run or discarded without
 * touching the image the user photographed.
 */

export interface ReceiptDTO {
  id: string;
  status: string;
  confidence: number | null;
  merchantName: string | null;
  total: MoneyDTO | null;
  purchasedAt: string | null;
  transactionId: string | null;
  createdAt: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  errorCode: string | null;
}

export async function list(
  actor: ActorContext,
  options: { limit?: number } = {},
  db: Db = rootDb,
): Promise<ReceiptDTO[]> {
  const rows = await db
    .select({
      id: receipts.id,
      status: receipts.status,
      confidence: receipts.confidence,
      merchantName: receipts.merchantName,
      totalMinor: receipts.totalMinor,
      currency: receipts.currency,
      purchasedAt: receipts.purchasedAt,
      transactionId: receipts.transactionId,
      createdAt: receipts.createdAt,
      errorCode: receipts.errorCode,
      filename: attachments.filename,
      contentType: attachments.contentType,
      sizeBytes: attachments.sizeBytes,
    })
    .from(receipts)
    .innerJoin(attachments, eq(attachments.id, receipts.attachmentId))
    .where(and(eq(receipts.userId, actor.userId), isNull(attachments.deletedAt)))
    .orderBy(desc(receipts.createdAt))
    .limit(Math.min(options.limit ?? 100, 200));

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    confidence: r.confidence,
    merchantName: r.merchantName,
    total: r.totalMinor !== null && r.currency ? toDTO(money(r.totalMinor, r.currency)) : null,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    transactionId: r.transactionId,
    createdAt: r.createdAt.toISOString(),
    filename: r.filename,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    errorCode: r.errorCode,
  }));
}

/** Counts by status, for the page header and the nav badge. */
export async function counts(actor: ActorContext, db: Db = rootDb) {
  const rows = await list(actor, { limit: 200 }, db);
  return {
    total: rows.length,
    unmatched: rows.filter((r) => !r.transactionId).length,
    failed: rows.filter((r) => r.status === "FAILED").length,
  };
}
