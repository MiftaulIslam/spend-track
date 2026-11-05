"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/src/components/ui";
import { Sheet, SheetBody, SheetContent, SheetFoot } from "@/src/components/sheet";
import { toast } from "@/src/components/toaster";
import { deleteTransactionsAction, restoreTransactionsAction } from "@/src/app-actions/transactions";

/**
 * Destructive actions on a transaction.
 *
 * Delete is soft and undoable from the toast, so the confirmation dialog can be
 * brief rather than a scary wall of text — the real safety net is that nothing
 * is actually gone.
 */
export function TransactionActions({
  transactionId,
  isTransfer,
  canRefund,
}: {
  transactionId: string;
  isTransfer: boolean;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteTransactionsAction([transactionId]);
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't delete that.");
        return;
      }
      setConfirming(false);
      toast.success(isTransfer ? "Transfer deleted — both sides" : "Transaction deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            const undone = await restoreTransactionsAction([transactionId]);
            if (undone.ok) {
              toast("Restored");
              router.push(`/transactions/${transactionId}`);
              router.refresh();
            }
          },
        },
      });
      router.push("/transactions");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm">Edit</Button>
        <Button size="sm">Duplicate</Button>
        {canRefund ? <Button size="sm">Record a refund</Button> : null}
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>

      <Sheet open={confirming} onOpenChange={setConfirming}>
        <SheetContent title={isTransfer ? "Delete this transfer?" : "Delete this transaction?"}>
          <SheetBody className="px-4 py-4">
            <p className="text-sm leading-relaxed text-ink-secondary">
              {isTransfer
                ? "Both sides of the transfer are removed together — a one-sided transfer would leave two accounts disagreeing."
                : "It stays recoverable for 30 days, and you can undo this straight away."}{" "}
              Account balances update immediately.
            </p>
          </SheetBody>
          <SheetFoot className="flex gap-2">
            <Button variant="danger" block disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
            <Button block onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </SheetFoot>
        </SheetContent>
      </Sheet>
    </>
  );
}
