"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/src/components/ui";
import { markAllNotificationsReadAction } from "@/src/app-actions/notifications";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (!result.ok) {
            toast.error(result.error?.message ?? "Couldn't mark those as read.");
            return;
          }
          router.refresh();
        })
      }
    >
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
