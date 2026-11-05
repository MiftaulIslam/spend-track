"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Callout, Field, Input, Select } from "@/src/components/ui";
import { Sheet, SheetBody, SheetContent, SheetFoot } from "@/src/components/sheet";
import { IconCheck, IconInfo } from "@/src/components/icons";
import { toast } from "@/src/components/toaster";
import { payBillAction } from "@/src/app-actions/planning";

/**
 * Mark a bill paid.
 *
 * This is the moment a bill becomes a transaction, so the amount is editable —
 * an estimated bill is almost never exactly the estimate, and forcing the
 * estimate into the ledger would make every variable bill wrong.
 */
export function PayBillButton({
  occurrenceId,
  billName,
  expected,
  currency,
  accounts,
  defaultAccountId,
  today,
}: {
  occurrenceId: string;
  billName: string;
  expected: string;
  currency: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  defaultAccountId: string;
  /** Today in the user's timezone, resolved on the server. */
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(expected);
  const [accountId, setAccountId] = useState(defaultAccountId);
  // Today where the user is — see src/domain/datetime.ts.
  const [paidAt, setPaidAt] = useState(today);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await payBillAction({
        occurrenceId,
        amount,
        accountId,
        paidAt,
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't record that payment.");
        return;
      }
      setOpen(false);
      toast.success(`${billName} marked paid`, {
        description: "A transaction has been recorded on the account.",
      });
      router.refresh();
    });
  }

  const differs = Number(amount) !== Number(expected);

  return (
    <>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setOpen(true)}>
        <IconCheck size={14} />
        <span className="hidden sm:inline">Pay</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title={`Mark ${billName} paid`}>
          <SheetBody className="flex flex-col gap-3 px-4 py-4">
            <Field label={`Amount paid (${currency})`} hint={`Expected ${expected}`}>
              <Input
                autoFocus
                inputMode="decimal"
                className="num text-lg"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Paid from">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date paid">
              <Input type="date" className="num" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>

            {differs ? (
              <Callout tone="info" icon={<IconInfo />}>
                Recording {amount} rather than the {expected} estimate. Future estimates for this bill
                use the trailing six actual payments, so this will improve them.
              </Callout>
            ) : null}
          </SheetBody>
          <SheetFoot>
            <Button
              variant="primary"
              size="lg"
              block
              disabled={pending || !(Number(amount) > 0)}
              onClick={submit}
            >
              {pending ? "Recording…" : `Record payment · ${amount}`}
            </Button>
          </SheetFoot>
        </SheetContent>
      </Sheet>
    </>
  );
}
