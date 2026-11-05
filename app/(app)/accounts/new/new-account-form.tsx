"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAccountAction } from "@/src/app-actions/accounts";
import { Button, Callout, cn, Field, Input, Panel, PanelBody, Select } from "@/src/components/ui";
import { IconInfo } from "@/src/components/icons";
import {
  ACCOUNT_KINDS,
  BD_BANKS,
  BD_KINDS,
  BD_MOBILE_BANKING,
  KINDS_WITH_BANK_LIST,
  OTHER_OPTION,
  TYPES_FOR_KIND,
  type AccountKind,
} from "@/src/lib/institutions";

/**
 * Add-account form.
 *
 * It asks what kind of thing this is before it asks anything else, because the
 * ledger's vocabulary is not the user's: someone adding bKash should pick
 * bKash, not deduce that it is a DIGITAL_WALLET. The kind then decides which
 * follow-up questions exist at all — a bank gets the bank list, a wallet gets
 * the provider list, cash gets neither.
 *
 * The name is derived from those answers and only kept as an override once the
 * user edits it, so the common path is two clicks and a balance.
 */

const CARD_TYPES = new Set(["CREDIT_CARD"]);

const COMMON_CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR", "SAR", "AED", "MYR", "CAD", "AUD"];

export function NewAccountForm({
  baseCurrency,
  isFirst,
}: {
  baseCurrency: string;
  isFirst: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<AccountKind | null>(null);
  const [type, setType] = useState("");
  const [institution, setInstitution] = useState("");
  const [customInstitution, setCustomInstitution] = useState("");

  const [name, setName] = useState("");
  // Until the user types a name themselves, it follows their other answers.
  const [nameEdited, setNameEdited] = useState(false);

  const [currency, setCurrency] = useState(baseCurrency);
  const [currencyEdited, setCurrencyEdited] = useState(false);

  const [openingBalance, setOpeningBalance] = useState("0");
  const [mask, setMask] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [paymentDueDay, setPaymentDueDay] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const types = kind ? TYPES_FOR_KIND[kind] : [];
  const needsTypeChoice = types.length > 1;
  const usesBankList = kind ? KINDS_WITH_BANK_LIST.has(kind) : false;
  const usesWalletList = kind === "MOBILE_BANKING";
  const isCard = CARD_TYPES.has(type);

  const resolvedInstitution =
    institution === OTHER_OPTION ? customInstitution.trim() : institution.trim();

  const currencies = useMemo(
    () => [...new Set([baseCurrency, ...COMMON_CURRENCIES])],
    [baseCurrency],
  );

  /** Name follows the answers until the user takes it over. */
  function deriveName(nextInstitution: string, nextType: string, nextKind: AccountKind | null) {
    if (nameEdited) return;
    if (!nextInstitution) {
      const fallback = nextKind === "CASH" ? "Cash" : "";
      setName(fallback);
      return;
    }
    // A wallet is already a product name; a bank needs the account kind to be
    // distinguishable from the user's other account at the same bank.
    const suffix = TYPES_FOR_KIND[nextKind ?? "OTHER"]?.find(([t]) => t === nextType)?.[1] ?? "";
    setName(
      nextKind === "MOBILE_BANKING" || !suffix
        ? nextInstitution
        : `${nextInstitution} ${suffix.replace(/ account$/, "")}`,
    );
  }

  function chooseKind(next: AccountKind) {
    setKind(next);
    const [firstType] = TYPES_FOR_KIND[next];
    setType(firstType![0]);
    setInstitution("");
    setCustomInstitution("");
    setIssues({});
    setFormError(null);
    // Bangladeshi institutions bill in taka; keep whatever the user chose if
    // they have already expressed a preference.
    if (!currencyEdited && BD_KINDS.has(next)) setCurrency("BDT");
    deriveName("", firstType![0], next);
  }

  function chooseInstitution(value: string) {
    setInstitution(value);
    const resolved = value === OTHER_OPTION ? customInstitution.trim() : value;
    deriveName(resolved, type, kind);
  }

  function chooseType(value: string) {
    setType(value);
    deriveName(resolvedInstitution, value, kind);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setIssues({});

    startTransition(async () => {
      const result = await createAccountAction({
        name,
        type,
        currency,
        openingBalance: openingBalance.trim() || "0",
        institution: resolvedInstitution || undefined,
        mask: mask.trim() || undefined,
        // Only send the card fields when they apply, so an empty string never
        // reaches a schema that expects a number.
        creditLimit: isCard && creditLimit.trim() ? creditLimit.trim() : undefined,
        statementDay: isCard && statementDay ? Number(statementDay) : undefined,
        paymentDueDay: isCard && paymentDueDay ? Number(paymentDueDay) : undefined,
      });

      if (!result.ok) {
        const fieldIssues = Object.fromEntries(
          (result.error?.issues ?? []).map((issue) => [issue.path, issue.message]),
        );
        setIssues(fieldIssues);
        if (Object.keys(fieldIssues).length === 0) {
          setFormError(result.error?.message ?? "We couldn't create that account.");
        }
        return;
      }

      const created = result.data!;
      toast.success(`${created.name} added.`);
      // The first account unlocks the dashboard, which is what they came here
      // for; later ones belong back on the list beside their siblings.
      router.push(created.isFirst ? "/" : "/accounts");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {isFirst ? (
        <Callout tone="info" icon={<IconInfo />}>
          Nothing connects to a bank. Enter the balance you see today and the ledger counts forward
          from there.
        </Callout>
      ) : null}

      {formError ? (
        <Callout tone="danger" icon={<IconInfo />}>
          {formError}
        </Callout>
      ) : null}

      {/* ---------------------------------------------------- step 1: kind */}
      <Panel>
        <PanelBody className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-ink-secondary">What are you adding?</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACCOUNT_KINDS.map((option) => {
              const active = kind === option.kind;
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => chooseKind(option.kind)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left",
                    "transition-colors duration-150",
                    active
                      ? "border-brass bg-brass-wash text-ink"
                      : "border-rule-strong bg-surface text-ink hover:bg-sunken",
                  )}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-2xs text-ink-tertiary">{option.hint}</span>
                </button>
              );
            })}
          </div>
        </PanelBody>
      </Panel>

      {/* ------------------------------------------- step 2: the specifics */}
      {kind ? (
        <Panel>
          <PanelBody className="flex flex-col gap-4">
            {usesBankList ? (
              <Field label="Bank" error={issues.institution}>
                <Select value={institution} onChange={(e) => chooseInstitution(e.target.value)}>
                  <option value="">Choose a bank…</option>
                  {BD_BANKS.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                  <option value={OTHER_OPTION}>Other bank…</option>
                </Select>
              </Field>
            ) : null}

            {usesWalletList ? (
              <Field label="Provider" error={issues.institution}>
                <Select value={institution} onChange={(e) => chooseInstitution(e.target.value)}>
                  <option value="">Choose a provider…</option>
                  {BD_MOBILE_BANKING.map((provider) => (
                    <option key={provider.name} value={provider.name}>
                      {provider.name} · {provider.operator}
                    </option>
                  ))}
                  <option value={OTHER_OPTION}>Other provider…</option>
                </Select>
              </Field>
            ) : null}

            {institution === OTHER_OPTION ? (
              <Field label={usesWalletList ? "Provider name" : "Bank name"}>
                <Input
                  value={customInstitution}
                  onChange={(e) => {
                    setCustomInstitution(e.target.value);
                    if (!nameEdited) setName(e.target.value);
                  }}
                  placeholder={usesWalletList ? "Provider" : "Bank"}
                  maxLength={80}
                  autoFocus
                />
              </Field>
            ) : null}

            {needsTypeChoice ? (
              <Field label="Account type" error={issues.type}>
                <Select value={type} onChange={(e) => chooseType(e.target.value)}>
                  {types.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Name" error={issues.name} hint="What you call it in the app.">
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                placeholder="Savings"
                required
                maxLength={80}
                aria-invalid={Boolean(issues.name)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency" error={issues.currency}>
                <Select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setCurrencyEdited(true);
                  }}
                >
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Last digits" hint="Optional — 2 to 4 digits" error={issues.mask}>
                <Input
                  value={mask}
                  onChange={(e) => setMask(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="4821"
                  aria-invalid={Boolean(issues.mask)}
                />
              </Field>
            </div>

            <Field
              label="Opening balance"
              error={issues.openingBalance}
              hint="The balance today. Use a negative number for money owed."
            >
              <Input
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={Boolean(issues.openingBalance)}
              />
            </Field>
          </PanelBody>
        </Panel>
      ) : null}

      {/* -------------------------------------------- step 3: card details */}
      {kind && isCard ? (
        <Panel>
          <PanelBody className="flex flex-col gap-4">
            <Field label="Credit limit" hint="Optional" error={issues.creditLimit}>
              <Input
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                inputMode="decimal"
                placeholder="50000.00"
                aria-invalid={Boolean(issues.creditLimit)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Statement day" hint="Optional — 1 to 31" error={issues.statementDay}>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={statementDay}
                  onChange={(e) => setStatementDay(e.target.value)}
                  placeholder="18"
                  aria-invalid={Boolean(issues.statementDay)}
                />
              </Field>

              <Field label="Payment due day" hint="Optional — 1 to 31" error={issues.paymentDueDay}>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(e.target.value)}
                  placeholder="12"
                  aria-invalid={Boolean(issues.paymentDueDay)}
                />
              </Field>
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={pending || !kind}>
          {pending ? "Adding…" : "Add account"}
        </Button>
        <Button type="button" size="lg" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
