import { I, m, meter, spark, bars, stat, callout, txn } from "../kit.mjs";

/* ═══════════════════════════════════════════════════════════════ LANDING  */
const landing = {
  id: "landing",
  title: "Landing",
  note: "Persuade-mode marketing surface. Serif display, real product proof.",
  chrome: false,
  body: `
<style>
  .lp { max-width: 1120px; margin-inline: auto; padding-inline: 20px; }
  .lp-nav { position: sticky; top: 0; z-index: 30; backdrop-filter: blur(14px) saturate(160%);
            background: color-mix(in oklab, var(--paper) 78%, transparent); border-bottom: 1px solid var(--rule); }
  .lp-nav .lp { display: flex; align-items: center; gap: 24px; height: 60px; }
  .lp-hero { padding: 96px 0 72px; }
  .lp-hero h1 { font-family: var(--font-serif); font-weight: 400; font-size: clamp(2.8rem, 8.5vw, 5.4rem);
                line-height: 0.96; letter-spacing: -0.035em; max-width: 15ch; }
  .lp-hero h1 em { font-style: italic; color: var(--brass-deep); }
  .lp-hero p { margin-top: 26px; max-width: 46ch; font-size: var(--text-md); line-height: 1.6; color: var(--ink-secondary); }
  .lp-proof { display: grid; gap: 1px; background: var(--rule); border-block: 1px solid var(--rule); grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 768px) { .lp-proof { grid-template-columns: repeat(4, 1fr); } }
  .lp-proof div { background: var(--paper); padding: 22px 20px; }
  .lp-sec { padding: 84px 0; border-bottom: 1px solid var(--rule); }
  .lp-sec h2 { font-family: var(--font-serif); font-weight: 400; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -0.03em; max-width: 18ch; }
  .lp-feat { display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: var(--radius-lg); overflow: clip; margin-top: 36px; }
  @media (min-width: 900px) { .lp-feat { grid-template-columns: repeat(3, 1fr); } }
  .lp-feat > div { background: var(--surface); padding: 28px 24px; }
  .lp-feat h3 { font-size: var(--text-md); margin-bottom: 8px; }
  .lp-feat p { font-size: var(--text-sm); color: var(--ink-secondary); line-height: 1.6; }
</style>

<nav class="lp-nav"><div class="lp">
  <a class="row gap-2" href="#"><span class="brandmark__glyph">S</span><span class="brandmark__word">SpendTrack</span></a>
  <span class="grow"></span>
  <a class="tiny secondary hide-mobile" href="#">Product</a>
  <a class="tiny secondary hide-mobile" href="#">Security</a>
  <a class="tiny secondary hide-mobile" href="#">Pricing</a>
  <a class="btn btn--sm btn--secondary" href="signin.html">Sign in</a>
  <a class="btn btn--sm btn--primary" href="signin.html">Start free</a>
</div></nav>

<header class="lp-hero"><div class="lp">
  <div class="eyebrow">Personal finance, properly kept</div>
  <h1>Know where the money <em>actually</em> went.</h1>
  <p>Every account, every currency, every recurring charge — reconciled into one ledger you
     can trust. The arithmetic is exact and deterministic. The AI explains it; it never guesses it.</p>
  <div class="row gap-3 mt-6" style="flex-wrap:wrap">
    <a class="btn btn--primary btn--lg" href="signin.html">Start free with Google</a>
    <a class="btn btn--secondary btn--lg" href="dashboard.html">See a live demo</a>
  </div>
  <p class="tiny muted mt-3">No card required · Import from any bank CSV · Export everything, always</p>
</div></header>

<section class="lp-proof">
  <div><div class="eyebrow">Tracked</div><div class="display" style="font-size:var(--text-xl);margin-top:6px">$1.4B</div><p class="tiny muted">across member ledgers</p></div>
  <div><div class="eyebrow">Accuracy</div><div class="display" style="font-size:var(--text-xl);margin-top:6px">100%</div><p class="tiny muted">integer-cent arithmetic</p></div>
  <div><div class="eyebrow">Currencies</div><div class="display" style="font-size:var(--text-xl);margin-top:6px">168</div><p class="tiny muted">with historical rates</p></div>
  <div><div class="eyebrow">Import</div><div class="display" style="font-size:var(--text-xl);margin-top:6px">4 s</div><p class="tiny muted">for 10,000 rows</p></div>
</section>

<section class="lp-sec"><div class="lp">
  <div class="eyebrow">The problem with expense trackers</div>
  <h2>A transfer is not an expense. Most apps get this wrong.</h2>
  <p class="mt-4 secondary" style="max-width:56ch;line-height:1.65">Move $500 from checking to savings and a naive tracker counts it as spending.
    Pay your credit card and it double-counts every charge. SpendTrack models money movement properly:
    transfers net to zero, card payments settle a liability, refunds reverse the original expense against
    the original category and period.</p>
  <div class="panel mt-6" style="max-width:520px">
    ${txn({ name: "To Emergency Fund", meta: ["Transfer", "Checking → Savings"], amount: 500, dir: "xfer", cat: 12 })}
    ${txn({ name: "Amex Gold payment", meta: ["Card payment", "Checking → Amex"], amount: 1240, dir: "xfer", cat: 12 })}
    ${txn({ name: "Refund · Nike Store", meta: ["Reverses 02 Sep expense", "Shopping"], amount: 129, dir: "in", cat: 7 })}
    <div class="panel__foot row tiny"><span class="muted">Effect on September spending</span><span class="grow"></span><span class="num">−$129.00</span></div>
  </div>
</div></section>

<section class="lp-sec"><div class="lp">
  <div class="eyebrow">What you get</div>
  <h2>One ledger for everything you own and owe.</h2>
  <div class="lp-feat">
    ${[
      ["Every account type","Cash, checking, savings, credit and debit cards, prepaid, digital wallets, brokerage, retirement, loans — each with the behaviour it actually has."],
      ["Recurring that behaves","Daily to yearly, fixed or variable, with pause, skip and weekend handling. Bills are estimated from history until you confirm."],
      ["Budgets with pace","A budget without a pace marker is a number. Ours shows whether you're ahead or behind for where you are in the period."],
      ["Real multi-currency","Accounts hold their own currency. Conversions use the rate on the transaction date, not today's."],
      ["Receipts that file themselves","Photograph it. Claude reads merchant, total, tax and line items, then matches it to the charge that already posted."],
      ["An assistant with limits","It can search, summarise and propose. Anything that changes your data stops and asks. It cannot reach the database directly."],
    ].map(([h, p]) => `<div><h3>${h}</h3><p>${p}</p></div>`).join("")}
  </div>
</div></section>

<section class="lp-sec"><div class="lp">
  <div class="eyebrow">Security posture</div>
  <h2>Built like something that holds your money data.</h2>
  <ul class="col gap-3 mt-6" style="max-width:60ch">
    ${[
      "Every server operation re-checks ownership. Client-supplied IDs are never trusted.",
      "Financial writes run inside database transactions — a transfer either moves both sides or neither.",
      "The AI never receives credentials or database access. It calls a fixed set of audited tools under your permissions.",
      "Uploads are MIME-sniffed, size-limited and stripped of metadata.",
      "Every financial change is recorded with actor, timestamp and before/after values.",
    ].map(x => `<li class="row gap-3"><span style="color:var(--inflow);flex:none;margin-top:2px">${I("check")}</span><span class="secondary" style="line-height:1.6">${x}</span></li>`).join("")}
  </ul>
</div></section>

<footer style="padding:64px 0"><div class="lp row gap-4" style="flex-wrap:wrap;align-items:flex-end">
  <div class="col gap-2"><a class="row gap-2" href="#"><span class="brandmark__glyph">S</span><span class="brandmark__word">SpendTrack</span></a>
    <span class="tiny muted">© 2025 SpendTrack. Your data, your ledger.</span></div>
  <span class="grow"></span>
  <a class="btn btn--primary" href="signin.html">Start free</a>
</div></footer>`,
};

/* ════════════════════════════════════════════════════════════════ SIGN IN */
const signin = {
  id: "signin",
  title: "Sign in",
  note: "Google OAuth primary, email + password fallback, QA accounts listed.",
  chrome: false,
  body: `
<div style="min-height:100dvh;display:grid;grid-template-columns:1fr">
  <div style="display:grid;place-items:center;padding:32px 20px">
    <div style="width:100%;max-width:392px">
      <a class="row gap-2 mb-6" href="landing.html"><span class="brandmark__glyph">S</span><span class="brandmark__word">SpendTrack</span></a>
      <h1 style="font-family:var(--font-serif);font-weight:400;font-size:2.4rem;letter-spacing:-0.03em;line-height:1.05">Welcome back</h1>
      <p class="secondary mt-2" style="font-size:var(--text-sm)">Sign in to your ledger.</p>

      <button class="btn btn--secondary btn--lg btn--block mt-6" style="gap:10px">
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z"/><path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z"/></svg>
        Continue with Google
      </button>

      <div class="row gap-3 mt-6 mb-6"><span style="flex:1;height:1px;background:var(--rule)"></span>
        <span class="tiny muted">or</span><span style="flex:1;height:1px;background:var(--rule)"></span></div>

      <form class="col gap-3">
        <label class="field"><span class="field__label">Email</span>
          <input class="input" type="email" placeholder="you@example.com" value="qa.owner@spendtrack.test"></label>
        <label class="field"><span class="field__label">Password</span>
          <input class="input" type="password" value="password123"></label>
        <button class="btn btn--primary btn--lg btn--block mt-2">Sign in</button>
      </form>

      <div class="callout callout--info mt-6">${I("info")}<div><b>QA accounts</b> (seeded in development)
        <div class="num tiny mt-2" style="line-height:1.7">
          qa.owner@spendtrack.test · full ledger, 3 years of history<br>
          qa.new@spendtrack.test · brand-new account, empty states<br>
          qa.member@spendtrack.test · household member, limited permissions<br>
          qa.admin@spendtrack.test · platform super admin<br>
          <span class="muted">password: password123</span>
        </div></div></div>

      <p class="tiny muted mt-6" style="text-align:center;line-height:1.6">
        By continuing you agree to the <a href="#" style="text-decoration:underline">Terms</a> and
        <a href="#" style="text-decoration:underline">Privacy Policy</a>.</p>
    </div>
  </div>
</div>`,
};

/* ═════════════════════════════════════════════════════════════ ONBOARDING */
const onboarding = {
  id: "onboarding",
  title: "Onboarding",
  note: "Four steps to a usable ledger: currency, accounts, income, first budget.",
  chrome: false,
  body: `
<div style="min-height:100dvh;display:flex;flex-direction:column">
  <header class="appbar"><span class="brandmark__glyph">S</span>
    <span class="appbar__title">Set up your ledger</span><span class="appbar__spacer"></span>
    <button class="btn btn--sm btn--ghost">Skip for now</button></header>

  <div style="height:2px;background:var(--surface-sunken)"><div style="height:100%;width:50%;background:var(--brass);transition:width var(--dur-slow) var(--ease-out)"></div></div>

  <main class="main" style="padding-bottom:120px">
  <div class="container" style="max-width:600px">
    <div class="eyebrow mt-6">Step 2 of 4</div>
    <h1 style="font-size:var(--text-xl);margin-top:8px">Where does your money live?</h1>
    <p class="secondary mt-2" style="font-size:var(--text-sm);line-height:1.6">
      Add the accounts you actually use. You can add more later, and nothing here connects to a bank —
      you enter balances yourself or import a statement.</p>

    <div class="panel mt-6">
      ${[
        ["Chase Checking","Checking · USD",8240.12,"--cat-6","wallet"],
        ["Ally Savings","Savings · 4.20% APY",2600.43,"--cat-3","shield"],
        ["Amex Gold","Credit card · $10,000 limit",-2860.40,"--cat-1","receipt"],
      ].map(([n2, sub, bal, tone, ic]) => `
      <div class="row gap-3" style="padding:13px 16px;border-bottom:1px solid var(--rule-faint)">
        <span class="txn__icon" style="--cat:var(${tone})">${I(ic)}</span>
        <div class="col grow" style="min-width:0"><b style="font-size:var(--text-sm)">${n2}</b><span class="tiny muted">${sub}</span></div>
        <span class="num" style="font-size:var(--text-sm);color:var(--${bal < 0 ? "outflow" : "ink"})">${m(Math.abs(bal), { sign: bal < 0 ? "−" : "" })}</span>
        <button class="btn btn--icon btn--ghost" aria-label="Remove">${I("close","navitem__icon")}</button>
      </div>`).join("")}
      <div style="padding:12px 16px">
        <div class="row gap-2" style="flex-wrap:wrap">
          ${["Cash","Checking","Savings","Credit card","Debit card","Digital wallet","Investment","Loan"].map(t =>
            `<button class="chip">${I("plus")} ${t}</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="callout callout--brass mt-4">${I("sparkle")}<div>
      Already have a CSV from your bank? <a href="import.html" style="text-decoration:underline">Import it instead</a> —
      accounts, balances and up to 3 years of history are created for you.</div></div>
  </div>
  </main>

  <div style="position:fixed;bottom:0;inset-inline:0;padding:16px;border-top:1px solid var(--rule);background:var(--paper)">
    <div class="container row gap-2" style="max-width:600px">
      <button class="btn btn--ghost">Back</button><span class="grow"></span>
      <button class="btn btn--primary">Continue</button>
    </div>
  </div>
</div>`,
};

export default [landing, signin, onboarding];
