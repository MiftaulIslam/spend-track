import Link from "next/link";
import { Amount } from "@/src/components/money";
import { IconCheck } from "@/src/components/icons";

export const metadata = {
  title: "SpendTrack — Know where the money actually went",
  description:
    "Every account, every currency, every recurring charge — reconciled into one ledger you can trust. The arithmetic is exact. The AI explains it; it never guesses it.",
};

/**
 * The public surface.
 *
 * Persuade mode: serif display type, one argument per section, and real product
 * detail instead of feature bullets. The "a transfer is not an expense" section
 * is the actual differentiator, so it leads.
 */
export default function WelcomePage() {
  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-rule bg-paper/78 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-15 max-w-[1120px] items-center gap-6 px-5">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <span className="grid size-[26px] place-items-center rounded-[7px] bg-ink font-mono text-[13px] font-semibold text-brass-bright">
              S
            </span>
            <span className="font-serif text-[19px] tracking-[-0.015em]">SpendTrack</span>
          </Link>
          <span className="flex-1" />
          <Link
            href="/signin"
            className="inline-flex h-8 items-center rounded-md border border-rule-strong bg-surface px-3 text-sm font-medium"
          >
            Sign in
          </Link>
          <Link
            href="/signin"
            className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-sm font-medium text-ink-inverse"
          >
            Start free
          </Link>
        </div>
      </nav>

      <header className="mx-auto max-w-[1120px] px-5 pt-20 pb-16 lg:pt-24">
        <div className="eyebrow">Personal finance, properly kept</div>
        <h1 className="mt-3 max-w-[15ch] font-serif text-[clamp(2.8rem,8.5vw,5.4rem)] leading-[0.96] font-normal tracking-[-0.035em]">
          Know where the money <em className="text-brass-deep italic">actually</em> went.
        </h1>
        <p className="mt-6 max-w-[46ch] text-md leading-relaxed text-ink-secondary">
          Every account, every currency, every recurring charge — reconciled into one ledger you can
          trust. The arithmetic is exact and deterministic. The AI explains it; it never guesses it.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/signin"
            className="inline-flex h-12 items-center rounded-md bg-ink px-6 text-md font-medium text-ink-inverse transition-colors hover:bg-ink/88"
          >
            Start free
          </Link>
          <Link
            href="/signin"
            className="inline-flex h-12 items-center rounded-md border border-rule-strong bg-surface px-6 text-md font-medium transition-colors hover:bg-sunken"
          >
            See a demo ledger
          </Link>
        </div>
        <p className="mt-4 text-xs text-ink-tertiary">
          No card required · Import from any bank CSV · Export everything, always
        </p>
      </header>

      <section className="grid grid-cols-2 gap-px border-y border-rule bg-rule md:grid-cols-4">
        {[
          ["Arithmetic", "Exact", "integer minor units, no floats"],
          ["Currencies", "168", "with historical rates"],
          ["Account types", "11", "each with its real behaviour"],
          ["Your data", "Yours", "export everything, any time"],
        ].map(([label, figure, note]) => (
          <div key={label} className="bg-paper px-5 py-6">
            <div className="eyebrow">{label}</div>
            <div className="num mt-1.5 text-xl font-medium tracking-[-0.03em]">{figure}</div>
            <p className="mt-1 text-xs text-ink-tertiary">{note}</p>
          </div>
        ))}
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1120px] px-5 py-20">
          <div className="eyebrow">The problem with expense trackers</div>
          <h2 className="mt-3 max-w-[18ch] font-serif text-[clamp(2rem,5vw,3rem)] font-normal tracking-[-0.03em]">
            A transfer is not an expense.
          </h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-ink-secondary">
            Move $500 from checking to savings and a naive tracker counts it as spending. Pay your
            credit card and it double-counts every charge on that card. SpendTrack models money
            movement properly: transfers net to zero, card payments settle a liability, and refunds
            reverse the original expense against the original category and period.
          </p>

          <div className="mt-8 max-w-[520px] overflow-clip rounded-lg border border-rule bg-surface">
            {[
              ["To Emergency Fund", "Transfer · Checking → Savings", "500.00", "transfer"],
              ["Amex Gold payment", "Card payment · Checking → Amex", "1240.00", "transfer"],
              ["Refund · Nike Store", "Reverses a 2 Sep expense · Shopping", "129.00", "inflow"],
            ].map(([name, sub, amount, tone]) => (
              <div key={name} className="flex items-center gap-3 border-b border-rule-faint px-4 py-3 last:border-0">
                <span className="grid size-[34px] shrink-0 place-items-center rounded-md bg-neutral-wash text-ink-tertiary">
                  <IconCheck size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{name}</span>
                  <span className="block truncate text-xs text-ink-tertiary">{sub}</span>
                </span>
                <Amount
                  value={{ minor: String(Number(amount) * 100), currency: "USD", decimal: amount }}
                  size="md"
                  tone={tone as "transfer" | "inflow"}
                  sign={tone === "inflow" ? "always" : "never"}
                />
              </div>
            ))}
            <div className="flex border-t border-rule px-4 py-3 text-xs">
              <span className="text-ink-tertiary">Effect on this month&rsquo;s spending</span>
              <span className="num ml-auto">−$129.00</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1120px] px-5 py-20">
          <div className="eyebrow">What you get</div>
          <h2 className="mt-3 max-w-[18ch] font-serif text-[clamp(2rem,5vw,3rem)] font-normal tracking-[-0.03em]">
            One ledger for everything you own and owe.
          </h2>

          <div className="mt-9 grid gap-px overflow-clip rounded-lg border border-rule bg-rule lg:grid-cols-3">
            {[
              [
                "Every account type",
                "Cash, checking, savings, credit and debit cards, prepaid, digital wallets, brokerage, retirement, loans — each with the behaviour it actually has.",
              ],
              [
                "Recurring that behaves",
                "Daily to yearly, fixed or variable, with pause, skip and weekend handling. The 31st stays the 31st, even after February.",
              ],
              [
                "Budgets with pace",
                "A budget without a pace marker is just a number. Ours shows whether you're ahead or behind for where you are in the period.",
              ],
              [
                "Real multi-currency",
                "Accounts hold their own currency. Conversions use the rate on the transaction date, so last year's report doesn't change today.",
              ],
              [
                "Receipts that file themselves",
                "Photograph it. Claude reads merchant, total, tax and line items, then matches it to the charge that already posted.",
              ],
              [
                "An assistant with limits",
                "It can search, summarise and propose. Anything that changes your data stops and asks. It cannot reach the database at all.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="bg-surface p-7">
                <h3 className="text-md font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1120px] px-5 py-20">
          <div className="eyebrow">Security posture</div>
          <h2 className="mt-3 max-w-[20ch] font-serif text-[clamp(2rem,5vw,3rem)] font-normal tracking-[-0.03em]">
            Built like something that holds your money data.
          </h2>
          <ul className="mt-8 flex max-w-[60ch] flex-col gap-3">
            {[
              "Every server operation re-checks ownership. Client-supplied IDs are never trusted.",
              "Financial writes run inside database transactions — a transfer either moves both sides or neither.",
              "The AI never receives credentials or database access. It calls a fixed set of audited tools under your permissions.",
              "Uploads are content-sniffed, size-limited and stripped of metadata.",
              "Every financial change is recorded with actor, timestamp and before/after values.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-inflow">
                  <IconCheck size={16} />
                </span>
                <span className="leading-relaxed text-ink-secondary">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1120px] flex-wrap items-end gap-4 px-5 py-16">
        <div className="flex flex-col gap-2">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <span className="grid size-[26px] place-items-center rounded-[7px] bg-ink font-mono text-[13px] font-semibold text-brass-bright">
              S
            </span>
            <span className="font-serif text-[19px]">SpendTrack</span>
          </Link>
          <span className="text-xs text-ink-tertiary">
            © {new Date().getFullYear()} SpendTrack. Your data, your ledger.
          </span>
        </div>
        <span className="flex-1" />
        <Link
          href="/signin"
          className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-base font-medium text-ink-inverse"
        >
          Start free
        </Link>
      </footer>
    </>
  );
}
