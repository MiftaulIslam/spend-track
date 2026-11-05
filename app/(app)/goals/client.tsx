"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/src/components/ui";
import { Sheet, SheetBody, SheetContent, SheetFoot } from "@/src/components/sheet";
import { toast } from "@/src/components/toaster";
import { contributeToGoalAction } from "@/src/app-actions/planning";

/**
 * Contribute to a goal.
 *
 * Picking a source account makes this a real transfer into the linked account,
 * which is the point — the goal's "saved" figure is then reconcilable against
 * the balance rather than being a number someone typed.
 */
export function ContributeButton({
  goalId,
  goalName,
  currency,
  suggested,
  accounts,
  linkedAccountId,
}: {
  goalId: string;
  goalName: string;
  currency: string;
  suggested: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  linkedAccountId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggested);
  const [fromAccountId, setFromAccountId] = useState(
    accounts.find((a) => a.id !== linkedAccountId)?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await contributeToGoalAction({
        goalId,
        amount,
        fromAccountId: fromAccountId || undefined,
        occurredAt: new Date().toISOString(),
        note: note || undefined,
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't record that.");
        return;
      }
      setOpen(false);
      if (result.data?.completed) {
        toast.success(`${goalName} is fully funded`, {
          description: "Contributions are paused until you decide what's next.",
        });
      } else if (result.data?.milestonesReached.length) {
        toast.success(`Milestone reached: ${result.data.milestonesReached.join(", ")}`);
      } else {
        toast.success("Contribution recorded");
      }
      router.refresh();
    });
  }

  const canSubmit = Number(amount) > 0 && !pending;

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Contribute
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title={`Contribute to ${goalName}`}>
          <SheetBody className="flex flex-col gap-3 px-4 py-4">
            <Field label={`Amount (${currency})`}>
              <Input
                autoFocus
                inputMode="decimal"
                className="num text-lg"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field
              label="From account"
              hint={
                linkedAccountId
                  ? "Creates a real transfer into the goal's linked account."
                  : "This goal has no linked account, so the contribution is recorded on its own."
              }
            >
              <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                <option value="">Don&apos;t move money</option>
                {accounts
                  .filter((a) => a.id !== linkedAccountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </SheetBody>
          <SheetFoot>
            <Button variant="primary" size="lg" block disabled={!canSubmit} onClick={submit}>
              {pending ? "Recording…" : "Record contribution"}
            </Button>
          </SheetFoot>
        </SheetContent>
      </Sheet>
    </>
  );
}
