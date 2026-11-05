"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Callout,
  Field,
  Panel,
  PanelBody,
  PanelHead,
  Select,
  Textarea,
} from "@/src/components/ui";
import { IconInfo } from "@/src/components/icons";
import { importTransactionsAction, type ImportRow } from "@/src/app-actions/import";
import { guessRoles, parseCsv, parseCsvAmount, parseCsvDate, type ColumnRole } from "@/src/lib/csv";

/**
 * CSV import.
 *
 * Three stages on one page rather than a wizard: paste, check the mapping, see
 * what will be created. The preview is the point — importing a statement is
 * irreversible enough that a list of "here is row one as this ledger read it"
 * is worth more than any amount of explanatory copy.
 */

const ROLES: Array<[ColumnRole, string]> = [
  ["ignore", "Ignore"],
  ["date", "Date"],
  ["description", "Description"],
  ["amount", "Amount (signed)"],
  ["debit", "Debit / money out"],
  ["credit", "Credit / money in"],
];

export function ImportClient({
  accounts,
}: {
  accounts: Array<{ id: string; name: string; currency: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [text, setText] = useState("");
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [parsed, setParsed] = useState<ReturnType<typeof parseCsv> | null>(null);

  function readCsv(next: string) {
    setText(next);
    if (!next.trim()) {
      setParsed(null);
      setRoles([]);
      return;
    }
    const result = parseCsv(next);
    setParsed(result);
    setRoles(guessRoles(result.headers));
  }

  async function onFile(file: File) {
    readCsv(await file.text());
  }

  /** Turns the mapped columns into what the action expects, dropping unusable rows. */
  const resolved = useMemo(() => {
    if (!parsed) return { rows: [] as ImportRow[], skipped: 0 };

    const dateIndex = roles.indexOf("date");
    const descIndex = roles.indexOf("description");
    const amountIndex = roles.indexOf("amount");
    const debitIndex = roles.indexOf("debit");
    const creditIndex = roles.indexOf("credit");

    const rows: ImportRow[] = [];
    let skipped = 0;

    for (const cells of parsed.rows) {
      const date = dateIndex >= 0 ? parseCsvDate(cells[dateIndex] ?? "") : null;

      let amount: { value: string; negative: boolean } | null = null;
      let type: "EXPENSE" | "INCOME" = "EXPENSE";

      if (amountIndex >= 0) {
        amount = parseCsvAmount(cells[amountIndex] ?? "");
        // A signed amount column carries direction in the sign.
        if (amount) type = amount.negative ? "EXPENSE" : "INCOME";
      } else {
        const debit = debitIndex >= 0 ? parseCsvAmount(cells[debitIndex] ?? "") : null;
        const credit = creditIndex >= 0 ? parseCsvAmount(cells[creditIndex] ?? "") : null;
        if (debit) {
          amount = debit;
          type = "EXPENSE";
        } else if (credit) {
          amount = credit;
          type = "INCOME";
        }
      }

      if (!date || !amount) {
        skipped += 1;
        continue;
      }

      rows.push({
        occurredAt: date.toISOString(),
        amount: amount.value,
        type,
        description: descIndex >= 0 ? (cells[descIndex] ?? "").trim().slice(0, 200) : "",
      });
    }

    return { rows, skipped };
  }, [parsed, roles]);

  function runImport() {
    startTransition(async () => {
      const result = await importTransactionsAction({ accountId, rows: resolved.rows });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Import failed.");
        return;
      }
      const { imported, failed, errors } = result.data!;
      if (imported > 0)
        toast.success(`Imported ${imported} transaction${imported === 1 ? "" : "s"}.`);
      if (failed > 0) toast.error(`${failed} row${failed === 1 ? "" : "s"} could not be imported.`);
      for (const message of errors.slice(0, 3)) toast.error(message);
      if (imported > 0) {
        router.push("/transactions");
        router.refresh();
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <Callout tone="warning" icon={<IconInfo />}>
        Add an account first — an import has to land somewhere.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHead title="1 · Paste or upload your statement" />
        <PanelBody className="flex flex-col gap-4">
          <Field label="Import into">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="CSV file">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
              className="text-sm text-ink-secondary file:mr-3 file:rounded-md file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
          </Field>

          <Field label="…or paste the rows" hint="Include the header row.">
            <Textarea
              value={text}
              onChange={(e) => readCsv(e.target.value)}
              placeholder={"Date,Description,Debit,Credit\n01/09/2026,Grocery,1250.00,"}
              className="num min-h-[120px] text-xs"
            />
          </Field>
        </PanelBody>
      </Panel>

      {parsed ? (
        <Panel>
          <PanelHead title="2 · Check the columns" action={`${parsed.rows.length} rows found`} />
          <PanelBody className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {parsed.headers.map((header, index) => (
                <Field key={`${header}-${index}`} label={header || `Column ${index + 1}`}>
                  <Select
                    value={roles[index] ?? "ignore"}
                    onChange={(e) => {
                      const next = [...roles];
                      next[index] = e.target.value as ColumnRole;
                      setRoles(next);
                    }}
                  >
                    {ROLES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="text-2xs text-ink-tertiary">
              Use <b>Amount</b> when one column carries a sign, or <b>Debit</b> and <b>Credit</b>{" "}
              when direction is split across two.
            </p>
          </PanelBody>
        </Panel>
      ) : null}

      {parsed ? (
        <Panel>
          <PanelHead
            title="3 · Preview"
            action={
              resolved.skipped > 0
                ? `${resolved.skipped} unreadable`
                : `${resolved.rows.length} ready`
            }
          />
          <PanelBody className="px-0 pb-0">
            {resolved.rows.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-secondary">
                No rows could be read. Check that a date column and an amount column are mapped.
              </p>
            ) : (
              resolved.rows.slice(0, 8).map((row, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                >
                  <span className="num w-24 shrink-0 text-2xs text-ink-tertiary">
                    {new Date(row.occurredAt).toLocaleDateString()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{row.description || "—"}</span>
                  <Badge tone={row.type === "INCOME" ? "inflow" : "outflow"}>
                    {row.type.toLowerCase()}
                  </Badge>
                  <span className="num shrink-0 text-sm">{row.amount}</span>
                </div>
              ))
            )}
            {resolved.rows.length > 8 ? (
              <p className="px-4 py-2.5 text-2xs text-ink-tertiary">
                …and {resolved.rows.length - 8} more
              </p>
            ) : null}
          </PanelBody>
        </Panel>
      ) : null}

      <div>
        <Button
          variant="primary"
          size="lg"
          onClick={runImport}
          disabled={pending || resolved.rows.length === 0}
        >
          {pending
            ? "Importing…"
            : `Import ${resolved.rows.length || ""} transaction${resolved.rows.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
