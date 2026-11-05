"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/src/server/auth/guards";
import { actionError, actionOk, type ActionResult } from "@/src/server/errors";
import * as notificationService from "@/src/server/services/notification-service";

/**
 * Server Actions for notifications.
 *
 * The unread count is rendered in the app shell on every page, so these
 * revalidate the layout root rather than just the notifications page.
 */

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ marked: number }>> {
  try {
    const actor = await requireActor();
    const marked = await notificationService.markAllRead(actor);
    revalidatePath("/", "layout");
    return actionOk({ marked });
  } catch (error) {
    return actionError(error);
  }
}

export async function dismissNotificationAction(id: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireActor();
    await notificationService.dismiss(actor, id);
    revalidatePath("/", "layout");
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}
