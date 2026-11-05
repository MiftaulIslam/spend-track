"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Field, Panel, PanelBody, PanelHead, Select } from "@/src/components/ui";
import { updateSettingsAction } from "@/src/app-actions/settings";
import type { SettingsDTO } from "@/src/server/services/settings-service";

/**
 * Settings form.
 *
 * Saves the whole panel at once rather than on every change: a currency switch
 * re-renders every amount in the app, and doing that on each keystroke of a
 * timezone field would be both slow and alarming.
 */

const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR", "SAR", "AED", "MYR", "CAD", "AUD"];
const LOCALES = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["bn-BD", "বাংলা (Bangladesh)"],
  ["en-IN", "English (India)"],
];
const TIMEZONES = [
  "Asia/Dhaka",
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];
const WEEKDAYS = [
  [0, "Sunday"],
  [1, "Monday"],
  [6, "Saturday"],
] as const;

const TOGGLES: Array<[key: keyof SettingsDTO, label: string, hint: string]> = [
  ["hideBalances", "Hide balances", "Blur amounts until you reveal them"],
  ["reduceMotion", "Reduce motion", "Fewer transitions and animations"],
  ["aiEnabled", "Assistant", "Let the assistant read your ledger"],
  ["aiAutoCategorise", "Auto-categorise", "Suggest a category on new transactions"],
  ["aiAutoApplyMutations", "Auto-apply changes", "Let the assistant write without confirming"],
];

export function SettingsForm({ initial }: { initial: SettingsDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);

  function set<K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateSettingsAction({
        baseCurrency: values.baseCurrency,
        locale: values.locale,
        timezone: values.timezone,
        weekStartsOn: values.weekStartsOn,
        theme: values.theme,
        hideBalances: values.hideBalances,
        reduceMotion: values.reduceMotion,
        aiEnabled: values.aiEnabled,
        aiAutoCategorise: values.aiAutoCategorise,
        aiAutoApplyMutations: values.aiAutoApplyMutations,
      });

      if (!result.ok) {
        toast.error(result.error?.message ?? "Couldn't save those settings.");
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHead title="Money and dates" />
        <PanelBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base currency" hint="Everything is converted to this for totals.">
              <Select
                value={values.baseCurrency}
                onChange={(e) => set("baseCurrency", e.target.value)}
              >
                {[...new Set([values.baseCurrency, ...CURRENCIES])].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Language and formatting">
              <Select value={values.locale} onChange={(e) => set("locale", e.target.value)}>
                {LOCALES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Time zone">
              <Select value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {[...new Set([values.timezone, ...TIMEZONES])].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Week starts on">
              <Select
                value={String(values.weekStartsOn)}
                onChange={(e) => set("weekStartsOn", Number(e.target.value))}
              >
                {WEEKDAYS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHead title="Appearance and privacy" />
        <PanelBody className="flex flex-col">
          {TOGGLES.map(([key, label, hint]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 border-b border-rule-faint py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm">{label}</span>
                <span className="block text-2xs text-ink-tertiary">{hint}</span>
              </div>
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-[var(--color-brass)]"
                checked={Boolean(values[key])}
                onChange={(e) => set(key, e.target.checked as SettingsDTO[typeof key])}
              />
            </label>
          ))}
        </PanelBody>
      </Panel>

      <div>
        <Button variant="primary" size="lg" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
