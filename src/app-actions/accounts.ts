"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as accountService from "@/src/server/services/account-service";
import * as onboardingService from "@/src/server/services/onboarding-service";
import { createAccountSchema } from "@/src/lib/schemas";

/**
 * Server Actions for the account surfaces.
 *
 * Like `transactions.ts`, this is a transport adapter: resolve the actor,
 * validate the input, call the service. No business logic lives here.
 */

/** Paths whose data changes whenever the set of accounts does. */
const ACCOUNT_PATHS = ["/", "/accounts", "/analytics", "/budgets"];

function revalidateAccounts(): void {
  for (const path of ACCOUNT_PATHS) revalidatePath(path);
}

export async function createAccountAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; isFirst: boolean }>> {
  try {
    const actor = await requireActor();
    const parsed = createAccountSchema.parse(input);

    // Read before the insert — afterwards there is always at least one.
    const isFirst = (await accountService.list(actor)).length === 0;

    const created = await accountService.create(actor, parsed);

    // Creating the first account *is* completing onboarding. Stamping it here,
    // rather than from a wizard step the user could skip, keeps
    // `onboardingCompletedAt` from disagreeing with whether an account exists —
    // the exact drift that left new accounts unable to reach the product.
    if (isFirst) await onboardingService.completeOnboarding(actor.userId);

    revalidateAccounts();
    return actionOk({ id: created.id, name: created.name, isFirst });
  } catch (error) {
    return actionError(error);
  }
}
