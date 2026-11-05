"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as settingsService from "@/src/server/services/settings-service";

/**
 * Server Actions for settings.
 *
 * Base currency, locale and timezone all feed the app shell and every rendered
 * amount, so this revalidates the whole layout rather than one page.
 */
export async function updateSettingsAction(
  input: unknown,
): Promise<ActionResult<{ baseCurrency: string }>> {
  try {
    const actor = await requireActor();
    const updated = await settingsService.update(actor, input as never);
    revalidatePath("/", "layout");
    return actionOk({ baseCurrency: updated.baseCurrency });
  } catch (error) {
    return actionError(error);
  }
}
