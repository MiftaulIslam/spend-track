"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/src/components/ui";
import { Sheet, SheetBody, SheetContent, SheetFoot } from "@/src/components/sheet";
import { toast } from "@/src/components/toaster";
import { cancelSubscriptionAction } from "@/src/app-actions/planning";

/**
 * Cancel a subscription.
 *
 * Cancelling here records the decision and stops the recurring schedule so no
 * phantom charges keep appearing. It cannot cancel with the *provider* — saying
 * otherwise would be the most damaging kind of fake button in this product, so
 * the dialog is explicit about it.
 */
export function CancelButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelSubscriptionAction(id);
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't update that.");
        return;
      }
      setOpen(false);
      toast.success(`${name} marked cancelled`, {
        description: "Its recurring schedule has stopped.",
      });
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="iconSm"
        variant="ghost"
        aria-label={`Cancel ${name}`}
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title={`Mark ${name} as cancelled?`}>
          <SheetBody className="px-4 py-4">
            <p className="text-sm leading-relaxed text-ink-secondary">
              This records the cancellation here and stops the recurring schedule, so it will not
              keep appearing in your upcoming costs.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              <b>It does not cancel with the provider.</b> You will still need to do that on their
              site or app — SpendTrack has no way to act on your behalf there.
            </p>
          </SheetBody>
          <SheetFoot className="flex gap-2">
            <Button variant="primary" block disabled={pending} onClick={cancel}>
              {pending ? "Saving…" : "Mark cancelled"}
            </Button>
            <Button block onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </SheetFoot>
        </SheetContent>
      </Sheet>
    </>
  );
}
