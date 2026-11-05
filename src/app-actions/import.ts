"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as transactionService from "@/src/server/services/transaction-service";

/**
 * Server Action for CSV import.
 *
 * Parsing and column mapping happen on the client, where the user can see and
 * correct them; this receives already-resolved rows. Each row is created
 * through the same service the manual form uses, so an imported transaction is
 * indistinguishable from a typed one — balances, rules and audit all fire.
 */

export interface ImportRow {
  occurredAt: string;
  amount: string;
  type: "EXPENSE" | "INCOME";
  description: string;
}

export async function importTransactionsAction(input: {
  accountId: string;
  rows: ImportRow[];
}): Promise<ActionResult<{ imported: number; failed: number; errors: string[] }>> {
  try {
    const actor = await requireActor();

    if (!input?.accountId) throw new Error("Choose an account to import into.");
    const rows = Array.isArray(input.rows) ? input.rows.slice(0, 2000) : [];
    if (rows.length === 0) throw new Error("There are no rows to import.");

    let imported = 0;
    const errors: string[] = [];

    // Sequential rather than Promise.all: each create recomputes the account
    // balance, and running them concurrently would have them race on the same
    // cached balance row.
    for (const [index, row] of rows.entries()) {
      try {
        await transactionService.create(actor, {
          accountId: input.accountId,
          type: row.type,
          amount: row.amount,
          occurredAt: new Date(row.occurredAt),
          description: row.description || undefined,
          status: "CLEARED",
          tagIds: [],
          tagNames: [],
          attachmentIds: [],
          excludeFromBudget: false,
        });
        imported += 1;
      } catch (error) {
        // One malformed row should not abandon the other nine hundred.
        const message = error instanceof Error ? error.message : "Unknown error";
        if (errors.length < 10) errors.push(`Row ${index + 1}: ${message}`);
      }
    }

    revalidatePath("/", "layout");
    return actionOk({ imported, failed: rows.length - imported, errors });
  } catch (error) {
    return actionError(error);
  }
}
