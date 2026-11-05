"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as transactionService from "@/src/server/services/transaction-service";
import * as transferService from "@/src/server/services/transfer-service";
import * as features from "@/src/server/ai/features";
import {
  createTransactionSchema,
  createTransferSchema,
  updateTransactionSchema,
} from "@/src/lib/schemas";

/**
 * Server Actions for the transaction surfaces.
 *
 * Each one does exactly three things: resolve the actor, validate the input,
 * call the service. No business logic lives here — this file is a transport
 * adapter, the same as a Route Handler.
 */

/** Paths whose data changes whenever the ledger does. */
const LEDGER_PATHS = ["/", "/transactions", "/accounts", "/budgets", "/analytics"];

function revalidateLedger(): void {
  for (const path of LEDGER_PATHS) revalidatePath(path);
}

export async function createTransactionAction(
  input: unknown,
): Promise<ActionResult<{ id: string; accountName: string }>> {
  try {
    const actor = await requireActor();
    const parsed = createTransactionSchema.parse(input);
    const created = await transactionService.create(actor, parsed);
    revalidateLedger();
    return actionOk({ id: created.id, accountName: created.accountName });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateTransactionAction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor();
    const parsed = updateTransactionSchema.parse(input);
    const updated = await transactionService.update(actor, id, parsed);
    revalidateLedger();
    revalidatePath(`/transactions/${id}`);
    return actionOk({ id: updated.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function createTransferAction(
  input: unknown,
): Promise<ActionResult<{ id: string; outTransactionId: string }>> {
  try {
    const actor = await requireActor();
    const parsed = createTransferSchema.parse(input);
    const transfer = await transferService.create(actor, parsed);
    revalidateLedger();
    return actionOk({ id: transfer.id, outTransactionId: transfer.outTransactionId });
  } catch (error) {
    return actionError(error);
  }
}

/** Powers the undo on the save toast. */
export async function undoTransactionAction(id: string): Promise<ActionResult<{ deleted: number }>> {
  try {
    const actor = await requireActor();
    const result = await transactionService.remove(actor, [id]);
    revalidateLedger();
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteTransactionsAction(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    const actor = await requireActor();
    const result = await transactionService.remove(actor, ids);
    revalidateLedger();
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreTransactionsAction(ids: string[]): Promise<ActionResult<{ restored: number }>> {
  try {
    const actor = await requireActor();
    const result = await transactionService.restore(actor, ids);
    revalidateLedger();
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkUpdateTransactionsAction(
  ids: string[],
  changes: { categoryId?: string | null; addTagIds?: string[]; needsReview?: boolean; excludeFromBudget?: boolean },
): Promise<ActionResult<{ updated: number }>> {
  try {
    const actor = await requireActor();
    const result = await transactionService.bulkUpdate(actor, ids, changes);
    revalidateLedger();
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

/** Natural-language draft for quick add. Returns a draft; saves nothing. */
export async function parsePhraseAction(
  phrase: string,
): Promise<ActionResult<features.ParsedTransaction | null>> {
  try {
    const actor = await requireActor();
    const parsed = await features.parseNaturalLanguageTransaction(actor, phrase);
    return actionOk(parsed);
  } catch (error) {
    return actionError(error);
  }
}

export async function findDuplicatesAction(candidate: {
  accountId: string;
  amount: string;
  currency: string;
  occurredAt: string;
}): Promise<ActionResult<Array<{ id: string; description: string | null; occurredAt: string }>>> {
  try {
    const actor = await requireActor();
    const rows = await transactionService.findDuplicates(actor, {
      ...candidate,
      occurredAt: new Date(candidate.occurredAt),
    });
    return actionOk(
      rows.map((r) => ({ id: r.id, description: r.description ?? r.merchantName, occurredAt: r.occurredAt })),
    );
  } catch (error) {
    return actionError(error);
  }
}
