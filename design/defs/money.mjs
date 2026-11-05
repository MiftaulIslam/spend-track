import { I, m, appbar, txn, dayGroup, meter, bars, spark, donut, stat, empty, callout, listRow } from "../kit.mjs";

const searchBtn = `<button class="btn btn--icon btn--ghost" aria-label="Search">${I("search", "navitem__icon")}</button>`;
const filterBtn = `<button class="btn btn--icon btn--ghost" aria-label="Filter">${I("filter", "navitem__icon")}</button>`;
const moreBtn = `<button class="btn btn--icon btn--ghost" aria-label="More">${I("more", "navitem__icon")}</button>`;

/* ═══════════════════════════════════════════════════════════════ DASHBOARD */
const dashboard = {
  id: "dashboard",
  title: "Overview",
  note: "Net worth, this month's flow, budget pulse, upcoming obligations, AI brief.",
  body: `
${appbar("Good evening, Miftaul", "Wednesday, 17 September", `${searchBtn}<button class="btn btn--icon btn--ghost hide-desktop" aria-label="Notifications">${I("bell","navitem__icon")}</button>`)}
<main class="main">
<div class="container">

  <!-- The one number that matters, then its trend. No card around it: the
       page itself is the container. Cards here would add a box for nothing. -->
  <section style="padding:24px 0 20px">
    <div class="eyebrow">Net worth · USD</div>
    <div class="display display--hero mt-2">${m(48291.4)}</div>
    <div class="row gap-2 mt-2 tiny">
      <span class="badge badge--in">${I("arrow-up")} +$1,284.10</span>
      <span class="muted">this month · 2.7%</span>
    </div>
    <div class="mt-4" style="margin-inline:-4px">${spark([41200, 41850, 41300, 42800, 43900, 43100, 44600, 45200, 44800, 46100, 47000, 48291], "--inflow", 320, 64)}</div>
    <div class="chart__axis" style="padding-inline:4px"><span>Oct</span><span>Jan</span><span>Apr</span><span>Jul</span><span>Sep</span></div>
  </section>

  <div class="statgrid">
    ${stat("In · September", m(6420.0, { cls: "num--in" }), "+4.1% vs Aug", "up")}
    ${stat("Out · September", m(4193.76), "−7.2% vs Aug", "up")}
    ${stat("Saved", m(2226.24), "34.7% rate")}
    ${stat("Free to spend", m(806.24), "13 days left")}
  </div>

  <!-- Budget pulse: the single most-checked thing after the balance. -->
  <section class="section">
    <div class="section__head">
      <h2 class="section__title">Budget pulse</h2>
      <a class="section__meta" href="budgets.html">All budgets ${I("arrow")}</a>
    </div>
    <div class="panel">
      <div class="budget-row">
        <div class="budget-row__top"><span class="budget-row__name">Groceries</span>
          <span class="budget-row__amt"><b>${m(512.4)}</b> <span>/ ${m(600)}</span></span></div>
        ${meter(85, "warn", 57)}
        <div class="budget-row__foot"><span>85% used · 57% of month elapsed</span><span>${m(87.6)} left</span></div>
      </div>
      <div class="budget-row">
        <div class="budget-row__top"><span class="budget-row__name">Dining out</span>
          <span class="budget-row__amt"><b>${m(348.15)}</b> <span>/ ${m(280)}</span></span></div>
        ${meter(124, "over", 57)}
        <div class="budget-row__foot"><span style="color:var(--danger)">Over by ${m(68.15)}</span><span>Rollover covers ${m(40)}</span></div>
      </div>
      <div class="budget-row">
        <div class="budget-row__top"><span class="budget-row__name">Transport</span>
          <span class="budget-row__amt"><b>${m(96.5)}</b> <span>/ ${m(220)}</span></span></div>
        ${meter(44, "ok", 57)}
        <div class="budget-row__foot"><span>On track</span><span>${m(123.5)} left</span></div>
      </div>
    </div>
  </section>

  <div class="grid-auto">
    <!-- Upcoming: bills + subscriptions + recurring, merged and sorted by date.
         One list, not three widgets — the user thinks in "what's coming". -->
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Next 14 days</h2>
        <a class="panel__action" href="calendar.html">Calendar</a></div>
      <div class="stagger">
        ${listRow({ lead: I("receipt"), title: "Rent", sub: "Fri 19 Sep · Chase Checking", right: m(1650), tone: "--cat-4", href: "bills.html" })}
        ${listRow({ lead: I("repeat"), title: "Spotify Family", sub: "Sat 20 Sep · Amex Gold", right: m(19.99), tone: "--cat-5", href: "subscriptions.html" })}
        ${listRow({ lead: I("zap"), title: "Con Edison", sub: "Mon 22 Sep · estimated", right: m(112.0), rightSub: "est.", tone: "--cat-6", href: "bills.html" })}
        ${listRow({ lead: I("trending-down"), title: "Auto loan payment", sub: "Wed 24 Sep · auto-pay", right: m(384.22), tone: "--cat-2", href: "debts.html" })}
        ${listRow({ lead: I("wallet"), title: "Salary · Northwind", sub: "Tue 30 Sep", right: `<span class="num num--in">+${m(3210).replace('<span class="num ">', "").replace("</span>", "")}</span>`, tone: "--cat-3", href: "transactions.html" })}
      </div>
    </section>

    <!-- Where money went. Donut earns its place: 6 parts of one whole. -->
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">September spending</h2>
        <a class="panel__action" href="analytics.html">Analytics</a></div>
      <div class="panel__body row gap-4" style="align-items:center">
        ${donut([[31, "--cat-1"], [22, "--cat-4"], [16, "--cat-3"], [12, "--cat-2"], [10, "--cat-6"], [9, "--cat-12"]])}
        <ul class="col gap-2 grow tiny">
          <li class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-1)"></span>Food &amp; dining<span class="grow"></span><span class="num">${m(1300.06)}</span></li>
          <li class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-4)"></span>Housing<span class="grow"></span><span class="num">${m(922.63)}</span></li>
          <li class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-3)"></span>Groceries<span class="grow"></span><span class="num">${m(670.99)}</span></li>
          <li class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-2)"></span>Transport<span class="grow"></span><span class="num">${m(503.25)}</span></li>
          <li class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-6)"></span>Utilities<span class="grow"></span><span class="num">${m(419.38)}</span></li>
          <li class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-12)"></span>Everything else<span class="grow"></span><span class="num">${m(377.45)}</span></li>
        </ul>
      </div>
    </section>
  </div>

  <!-- AI brief. Deterministic numbers computed server-side; Claude only writes
       the sentence around them. Every claim links to the query that produced it. -->
  <section class="section">
    <div class="panel" style="border-color:var(--brass-rule)">
      <div class="panel__head">
        <span class="txn__icon" style="--cat:var(--brass);width:26px;height:26px">${I("sparkle")}</span>
        <h2 class="panel__title">Weekly brief</h2>
        <span class="panel__action muted tiny">Generated 6:02 AM</span>
      </div>
      <div class="panel__body">
        <p style="line-height:1.6">You spent <b>${m(348.15)}</b> on dining this month against a
          <b>${m(280)}</b> budget — three <a href="transaction-detail.html" style="border-bottom:1px solid var(--brass-rule)">weekend dinners</a>
          account for ${m(212.4)} of it. Your Spotify plan renews at the family rate on Saturday but
          only one profile has been used since June; cancelling saves <b>${m(119.94)}/yr</b>.
          Income is ${m(260)} ahead of your 6-month average.</p>
        <div class="row gap-2 mt-3" style="flex-wrap:wrap">
          <a class="chip" href="budgets.html">Raise dining budget to $340</a>
          <a class="chip" href="subscriptions.html">Review Spotify</a>
          <a class="chip" href="assistant.html">Ask a follow-up</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Recent activity</h2>
      <a class="section__meta" href="transactions.html">All ${I("arrow")}</a></div>
    <div class="panel">
      ${txn({ name: "Blue Bottle Coffee", meta: ["Coffee shops", "Amex Gold"], amount: 6.75, cat: 1 })}
      ${txn({ name: "Whole Foods Market", meta: ["Groceries", "Chase Checking"], amount: 84.32, cat: 3 })}
      ${txn({ name: "Uber", meta: ["Rideshare", "Amex Gold"], amount: 18.4, cat: 2, pending: true })}
      ${txn({ name: "Refund · Nike", meta: ["Shopping", "Amex Gold"], amount: 129.0, dir: "in", cat: 7 })}
      ${txn({ name: "To Emergency Fund", meta: ["Transfer", "Checking → Savings"], amount: 500, dir: "xfer", cat: 12 })}
    </div>
  </section>
</div>
</main>`,
};

/* ════════════════════════════════════════════════════════════ TRANSACTIONS */
const transactions = {
  id: "transactions",
  title: "Transactions",
  note: "Virtualised ledger, sticky day headers, server-side filter chips, bulk edit.",
  body: `
${appbar("Transactions", "1,284 records · Sep 2025", `${searchBtn}${filterBtn}${moreBtn}`)}
<main class="main">
  <div class="chiprow">
    <button class="chip" aria-pressed="true">All</button>
    <button class="chip">Expenses</button>
    <button class="chip">Income</button>
    <button class="chip">Transfers</button>
    <button class="chip">${I("wallet")} Account</button>
    <button class="chip">${I("tag")} Category</button>
    <button class="chip">Uncategorised <span class="badge">12</span></button>
    <button class="chip">Needs review <span class="badge badge--warn">3</span></button>
  </div>

  <div class="container" style="padding-inline:0">
    <div class="row gap-3 tiny muted" style="padding:8px 16px;border-bottom:1px solid var(--rule)">
      <span>Showing 1–50 of 1,284</span><span class="grow"></span>
      <span class="num">Out ${m(4193.76)}</span><span class="num num--in">In ${m(6420.0)}</span>
    </div>

    ${dayGroup("Today · 17 Sep", `−${m(109.47).replace(/<[^>]+>/g, "")}`, `
      ${txn({ name: "Blue Bottle Coffee", meta: ["Coffee shops", "Amex Gold", "10:42"], amount: 6.75, cat: 1 })}
      ${txn({ name: "Whole Foods Market", meta: ["Groceries", "Chase Checking", "09:15"], amount: 84.32, cat: 3 })}
      ${txn({ name: "Uber", meta: ["Rideshare", "Amex Gold", "08:03"], amount: 18.4, cat: 2, pending: true })}
    `)}

    ${dayGroup("Tuesday · 16 Sep", `+${m(3100.53).replace(/<[^>]+>/g, "")}`, `
      ${txn({ name: "Refund · Nike Store", meta: ["Shopping", "Amex Gold"], amount: 129.0, dir: "in", cat: 7 })}
      ${txn({ name: "Freelance · Vireo Studio", meta: ["Side income", "Chase Checking"], amount: 3200.0, dir: "in", cat: 3 })}
      ${txn({ name: "Kinokuniya Books", meta: ["Shopping", "Amex Gold"], amount: 43.5, cat: 7 })}
      ${txn({ name: "Tokyo Metro", meta: ["Transport", "Wise Multi-currency"], amount: 4.2, cat: 2, cur: "$", fx: "¥620 @ 147.6" })}
      ${txn({ name: "To Emergency Fund", meta: ["Transfer", "Checking → Ally Savings"], amount: 500, dir: "xfer", cat: 12 })}
    `)}

    ${dayGroup("Monday · 15 Sep", `−${m(287.91).replace(/<[^>]+>/g, "")}`, `
      ${txn({ name: "Con Edison", meta: ["Utilities", "Chase Checking", "Auto-pay"], amount: 112.0, cat: 6 })}
      ${txn({ name: "Trader Joe's", meta: ["Groceries", "Chase Checking"], amount: 61.18, cat: 3 })}
      ${txn({ name: "Amex Gold payment", meta: ["Credit card payment", "Checking → Amex"], amount: 1240.0, dir: "xfer", cat: 12 })}
      ${txn({ name: "Rite Aid", meta: ["Health", "Amex Gold"], amount: 24.73, cat: 8 })}
      ${txn({ name: "Split · Dinner at Lilia", meta: ["Dining out", "3 people", "Amex Gold"], amount: 90.0, cat: 1 })}
    `)}

    <div class="row" style="justify-content:center;padding:24px">
      <button class="btn btn--secondary btn--sm">Load 50 more</button>
    </div>
  </div>
</main>`,
};

/* ═════════════════════════════════════════════════════ TRANSACTION DETAIL */
const transactionDetail = {
  id: "transaction-detail",
  title: "Transaction detail",
  note: "Full record with splits, attachments, tags, audit trail and reversal.",
  body: `
${appbar("Lilia", "Dining out · 15 Sep 2025", `${moreBtn}`, true)}
<main class="main">
<div class="container" style="max-width:760px">
  <section style="padding:24px 0;text-align:center;border-bottom:1px solid var(--rule)">
    <div class="txn__icon" style="--cat:var(--cat-1);width:48px;height:48px;margin:0 auto 12px">${I("store")}</div>
    <div class="display">−${m(90.0).replace(/^<span class="num ">/, "")}</div>
    <div class="row gap-2 mt-3" style="justify-content:center">
      <span class="badge badge--out">Expense</span>
      <span class="badge">Cleared</span>
      <span class="badge badge--info">Split 3 ways</span>
    </div>
  </section>

  <dl class="panel mt-6">
    ${[
      ["Account", "Amex Gold · ···4021"],
      ["Category", `<span class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-1)"></span>Dining out</span>`],
      ["Merchant", "Lilia · Brooklyn, NY"],
      ["Date", "Mon 15 Sep 2025, 19:40"],
      ["Payment", "Contactless"],
      ["Tags", `<span class="row gap-1"><span class="badge">anniversary</span><span class="badge">reimbursable</span></span>`],
    ].map(([k, v]) => `<div class="row" style="padding:11px 16px;border-bottom:1px solid var(--rule-faint)">
        <dt class="tiny secondary" style="width:96px;flex:none">${k}</dt><dd style="margin:0;font-size:var(--text-sm)">${v}</dd></div>`).join("")}
  </dl>

  <section class="panel mt-4">
    <div class="panel__head"><h2 class="panel__title">Split</h2><span class="panel__action muted">Total ${m(270.0)}</span></div>
    ${listRow({ lead: "MI", title: "You", sub: "Dining out", right: m(90.0) })}
    ${listRow({ lead: "AR", title: "Ayesha R.", sub: "Owed · reminded 16 Sep", right: m(90.0), rightSub: "unpaid", tone: "--warning" })}
    ${listRow({ lead: "TK", title: "Tomas K.", sub: "Settled via Venmo", right: m(90.0), rightSub: "settled", tone: "--inflow" })}
  </section>

  <section class="panel mt-4">
    <div class="panel__head"><h2 class="panel__title">Receipt</h2><span class="panel__action">Replace</span></div>
    <div class="panel__body">
      <div class="row gap-3">
        <div style="width:72px;height:96px;border-radius:var(--radius-sm);background:var(--surface-sunken);border:1px solid var(--rule);flex:none"></div>
        <div class="col gap-1 tiny">
          <b style="font-size:var(--text-sm)">lilia-15sep.jpg</b>
          <span class="muted">1.4 MB · uploaded 15 Sep</span>
          <span class="badge badge--in mt-2">${I("check")} AI-extracted · 96% match</span>
          <span class="muted">Merchant, total and tax matched the charge. Tip $38 detected.</span>
        </div>
      </div>
    </div>
  </section>

  <section class="panel mt-4">
    <div class="panel__head"><h2 class="panel__title">History</h2></div>
    <ul class="panel__body col gap-3 tiny">
      <li class="row gap-3"><span class="muted num" style="width:88px;flex:none">15 Sep 19:41</span><span>Created from Amex import</span></li>
      <li class="row gap-3"><span class="muted num" style="width:88px;flex:none">15 Sep 19:41</span><span>Auto-categorised <b>Dining out</b> by rule <i>“Restaurant MCC 5812”</i></span></li>
      <li class="row gap-3"><span class="muted num" style="width:88px;flex:none">15 Sep 22:10</span><span>Split into 3 by <b>you</b></span></li>
      <li class="row gap-3"><span class="muted num" style="width:88px;flex:none">16 Sep 08:02</span><span>Tag <b>reimbursable</b> added by assistant (confirmed)</span></li>
    </ul>
  </section>

  <div class="row gap-2 mt-6" style="flex-wrap:wrap">
    <button class="btn btn--secondary">Edit</button>
    <button class="btn btn--secondary">Duplicate</button>
    <button class="btn btn--secondary">Record refund</button>
    <button class="btn btn--ghost" style="color:var(--danger)">Delete</button>
  </div>
</div>
</main>`,
};

/* ═════════════════════════════════════════════════════════════ QUICK ADD  */
const quickAdd = {
  id: "quick-add",
  title: "Quick add",
  note: "Amount → category → account → save. Three taps, advanced fields collapsed.",
  chrome: false,
  body: `
<div style="min-height:100dvh;background:var(--overlay);display:flex;align-items:flex-end;justify-content:center">
<div class="sheet" style="position:static;animation:none;width:min(430px,100%);max-height:none;border-radius:16px 16px 0 0">
  <div class="sheet__grip"></div>
  <div class="sheet__head">
    <button class="btn btn--icon btn--ghost" aria-label="Close">${I("close", "navitem__icon")}</button>
    <span class="sheet__title">New transaction</span>
    <span class="appbar__spacer"></span>
    <button class="btn btn--sm btn--ghost">${I("camera")} Scan</button>
  </div>

  <div class="sheet__body">
    <div class="amountpad">
      <div class="amountpad__dir" role="group" aria-label="Direction">
        <button aria-pressed="true">Expense</button><button>Income</button><button>Transfer</button>
      </div>
      <div class="amountpad__value" style="color:var(--ink)">
        <span class="amountpad__cur">$</span>24<span style="opacity:.5">.</span><span style="opacity:.5">50</span>
        <span class="amountpad__caret"></span>
      </div>
      <span class="tiny muted">Amex Gold · USD</span>
    </div>

    <!-- Suggested category first. Learned from merchant + amount + time.
         One tap lands you on "save" — the rest is progressive disclosure. -->
    <div style="padding:0 16px 12px">
      <div class="eyebrow mb-2">Category</div>
      <div class="row gap-2" style="flex-wrap:wrap">
        <button class="chip" aria-pressed="true"><span class="chip__dot" style="--cat:var(--cat-1)"></span>Dining out</button>
        <button class="chip"><span class="chip__dot" style="--cat:var(--cat-3)"></span>Groceries</button>
        <button class="chip"><span class="chip__dot" style="--cat:var(--cat-2)"></span>Transport</button>
        <button class="chip"><span class="chip__dot" style="--cat:var(--cat-7)"></span>Shopping</button>
        <button class="chip">${I("search")} More</button>
      </div>
    </div>

    <div style="padding:0 16px 12px">
      <div class="eyebrow mb-2">Account</div>
      <div class="row gap-2" style="flex-wrap:wrap">
        <button class="chip" aria-pressed="true">Amex Gold ···4021</button>
        <button class="chip">Chase Checking</button>
        <button class="chip">Cash</button>
      </div>
    </div>

    <details style="border-top:1px solid var(--rule);padding:12px 16px">
      <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:500;color:var(--ink-secondary)">More details</summary>
      <div class="col gap-3 mt-3">
        <label class="field"><span class="field__label">Merchant</span>
          <input class="input" placeholder="Search merchants…" value="Lilia"></label>
        <label class="field"><span class="field__label">Date</span>
          <input class="input input--num" type="date" value="2025-09-17"></label>
        <label class="field"><span class="field__label">Note</span>
          <textarea class="input" placeholder="What was this for?"></textarea></label>
        <div class="row gap-2"><button class="chip">${I("tag")} Add tag</button><button class="chip">${I("users")} Split</button><button class="chip">${I("camera")} Attach</button></div>
      </div>
    </details>

    <div class="keypad">
      ${["1","2","3","4","5","6","7","8","9",".","0"].map(k => `<button>${k}</button>`).join("")}
      <button aria-label="Delete last digit">${I("backspace")}</button>
    </div>
  </div>

  <div class="sheet__foot">
    <button class="btn btn--primary btn--lg btn--block">Save expense · ${m(24.5)}</button>
    <p class="tiny muted mt-2" style="text-align:center">Saves to Amex Gold. <kbd>⌘↵</kbd> to save and add another.</p>
  </div>
</div>
</div>`,
};

/* ══════════════════════════════════════════════════════════════ ACCOUNTS  */
const accounts = {
  id: "accounts",
  title: "Accounts",
  note: "Assets vs liabilities, per-type grouping, multi-currency, reconciliation state.",
  body: `
${appbar("Accounts", "9 open · 2 need reconciling", `<button class="btn btn--sm btn--primary">${I("plus")} Add</button>`)}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("Assets", m(63741.2), "6 accounts")}
    ${stat("Liabilities", m(15449.8), "3 accounts")}
    ${stat("Net worth", m(48291.4), "+2.7% MoM", "up")}
    ${stat("Cash on hand", m(11240.55), "Liquid")}
  </div>

  ${callout("warn", "alert", `<b>Chase Checking</b> hasn't been reconciled since 2 Sep. Recorded balance is ${m(8240.12)}. <a href="reconciliation.html" style="text-decoration:underline">Reconcile now</a>`).replace("<div class=\"callout", "<div class=\"callout mt-4")}

  <section class="section">
    <div class="section__head"><h2 class="section__title">Cash &amp; banking</h2><span class="section__meta num">${m(11240.55)}</span></div>
    <div class="panel">
      ${listRow({ lead: I("wallet"), title: "Chase Checking", sub: "Checking · ···8821 · USD", right: m(8240.12), rightSub: "needs reconcile", tone: "--cat-6", href: "account-detail.html" })}
      ${listRow({ lead: I("shield"), title: "Ally Savings", sub: "Savings · 4.20% APY · USD", right: m(2600.43), rightSub: "+$9.11 interest", tone: "--cat-3", href: "account-detail.html" })}
      ${listRow({ lead: I("wallet"), title: "Cash", sub: "Physical wallet · USD", right: m(400.0), tone: "--cat-12", href: "account-detail.html" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Cards</h2><span class="section__meta num">−${m(3209.8).replace(/^<span class="num ">/, "")}</span></div>
    <div class="panel">
      ${listRow({ lead: I("receipt"), title: "Amex Gold", sub: "Credit · ···4021 · $10,000 limit", right: m(2860.4), rightSub: "due 02 Oct", tone: "--cat-1", href: "account-detail.html" })}
      ${listRow({ lead: I("receipt"), title: "Chase Freedom", sub: "Credit · ···9910 · $5,000 limit", right: m(349.4), rightSub: "0% until Mar", tone: "--cat-5", href: "account-detail.html" })}
      ${listRow({ lead: I("wallet"), title: "Revolut", sub: "Prepaid · EUR", right: m(452.1, { cur: "€" }), rightSub: "≈ $489.27", tone: "--cat-2", href: "account-detail.html" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Investments &amp; digital</h2><span class="section__meta num">${m(52011.9)}</span></div>
    <div class="panel">
      ${listRow({ lead: I("chart"), title: "Fidelity Brokerage", sub: "Investment · taxable", right: m(38420.0), rightSub: "+6.2% YTD", tone: "--cat-3", href: "account-detail.html" })}
      ${listRow({ lead: I("chart"), title: "Vanguard 401(k)", sub: "Investment · retirement", right: m(12904.4), rightSub: "+4.9% YTD", tone: "--cat-8", href: "account-detail.html" })}
      ${listRow({ lead: I("wallet"), title: "Wise Multi-currency", sub: "Digital wallet · USD · EUR · JPY", right: m(687.5), rightSub: "3 balances", tone: "--cat-11", href: "account-detail.html" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Loans</h2><span class="section__meta num">−${m(12240.0).replace(/^<span class="num ">/, "")}</span></div>
    <div class="panel">
      ${listRow({ lead: I("trending-down"), title: "Auto loan · Toyota", sub: "Liability · 4.9% APR · 34 mo left", right: m(12240.0), rightSub: "$384.22/mo", tone: "--cat-4", href: "debts.html" })}
    </div>
  </section>

  <p class="tiny muted mt-6" style="text-align:center">Archived accounts (2) are hidden. <a href="#" style="text-decoration:underline">Show archived</a></p>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════ ACCOUNT DETAIL   */
const accountDetail = {
  id: "account-detail",
  title: "Account detail",
  note: "Balance history, statement cycle, utilisation, per-account ledger.",
  body: `
${appbar("Amex Gold", "Credit card · ···4021", `${moreBtn}`, true)}
<main class="main">
<div class="container">
  <section style="padding:20px 0">
    <div class="eyebrow">Current balance</div>
    <div class="display mt-2">${m(2860.4)}</div>
    <div class="row gap-3 mt-3 tiny">
      <span class="muted">Available ${m(7139.6).replace(/<[^>]+>/g, "")}</span>
      <span class="muted">·</span><span class="muted">Statement closes 25 Sep</span>
    </div>
    <div class="mt-4">
      <div class="row tiny muted mb-2"><span>Utilisation</span><span class="grow"></span><span class="num">28.6% of $10,000</span></div>
      ${meter(28.6, "ok", 30)}
      <p class="tiny muted mt-2">Mark shows the 30% threshold that starts affecting credit scoring.</p>
    </div>
  </section>

  <div class="statgrid">
    ${stat("Minimum due", m(86.0), "by 02 Oct")}
    ${stat("Statement balance", m(2411.18), "closed 25 Aug")}
    ${stat("Interest rate", "24.74%", "purchase APR")}
    ${stat("Rewards", "18,204 pts", "+1,240 this cycle")}
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Balance over time</h2><span class="section__meta">12 months</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${spark([1900, 2400, 2100, 3100, 2600, 2900, 3400, 2200, 2500, 2700, 2411, 2860], "--outflow", 320, 90)}
      <div class="chart__axis"><span>Oct</span><span>Jan</span><span>Apr</span><span>Jul</span><span>Sep</span></div>
    </div></div>
  </section>

  <div class="row gap-2 mt-4" style="flex-wrap:wrap">
    <button class="btn btn--primary btn--sm">Pay card</button>
    <button class="btn btn--secondary btn--sm">Reconcile</button>
    <button class="btn btn--secondary btn--sm">Import statement</button>
    <button class="btn btn--ghost btn--sm">Archive</button>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Activity</h2><a class="section__meta" href="transactions.html">All</a></div>
    <div class="panel">
      ${txn({ name: "Blue Bottle Coffee", meta: ["Coffee shops", "17 Sep"], amount: 6.75, cat: 1 })}
      ${txn({ name: "Uber", meta: ["Rideshare", "17 Sep"], amount: 18.4, cat: 2, pending: true })}
      ${txn({ name: "Kinokuniya Books", meta: ["Shopping", "16 Sep"], amount: 43.5, cat: 7 })}
      ${txn({ name: "Refund · Nike Store", meta: ["Shopping", "16 Sep"], amount: 129.0, dir: "in", cat: 7 })}
      ${txn({ name: "Payment received", meta: ["From Chase Checking", "15 Sep"], amount: 1240.0, dir: "in", cat: 12 })}
    </div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════════ CALENDAR  */
const calendar = {
  id: "calendar",
  title: "Calendar",
  note: "Money calendar: bills, subscriptions, income, recurring, scheduled transfers.",
  body: `
${appbar("Calendar", "September 2025", `<button class="btn btn--icon btn--ghost">${I("back","navitem__icon")}</button><button class="btn btn--icon btn--ghost">${I("arrow","navitem__icon")}</button>`)}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("Scheduled out", m(2946.21), "11 events")}
    ${stat("Scheduled in", m(3210.0), "1 event")}
    ${stat("Projected end balance", m(9504.0), "+$263.79", "up")}
    ${stat("Lowest point", m(1854.0), "on 24 Sep", "down")}
  </div>

  <div class="panel mt-4">
    <div class="panel__body" style="padding:16px">
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:var(--text-2xs);color:var(--ink-tertiary);text-align:center;margin-bottom:6px">
        ${["M","T","W","T","F","S","S"].map(d => `<span>${d}</span>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
        ${Array.from({ length: 30 }, (_, i) => {
          const d = i + 1;
          const marks = { 1: ["--outflow"], 5: ["--inflow"], 15: ["--outflow", "--transfer"], 17: ["--outflow"], 19: ["--outflow"], 20: ["--outflow"], 22: ["--outflow"], 24: ["--outflow"], 30: ["--inflow"] }[d];
          const today = d === 17;
          return `<button style="aspect-ratio:1;border:1px solid ${today ? "var(--brass)" : "var(--rule-faint)"};border-radius:var(--radius-sm);background:${today ? "var(--brass-wash)" : "var(--surface)"};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--ink)">
            ${d}<span style="display:flex;gap:2px;height:4px">${(marks || []).map(c => `<i style="width:4px;height:4px;border-radius:50%;background:var(${c})"></i>`).join("")}</span></button>`;
        }).join("")}
      </div>
    </div>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Wednesday 17 September</h2><span class="section__meta">Today</span></div>
    <div class="panel">
      ${listRow({ lead: I("repeat"), title: "Adobe Creative Cloud", sub: "Subscription · Amex Gold", right: m(59.99), tone: "--cat-5" })}
      ${listRow({ lead: I("check"), title: "3 transactions recorded", sub: "−$109.47 net", right: m(109.47), tone: "--cat-12" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Coming up</h2></div>
    <div class="panel">
      ${listRow({ lead: I("receipt"), title: "Rent", sub: "Fri 19 Sep · bill · auto-pay off", right: m(1650.0), tone: "--cat-4" })}
      ${listRow({ lead: I("repeat"), title: "Spotify Family", sub: "Sat 20 Sep · subscription", right: m(19.99), tone: "--cat-5" })}
      ${listRow({ lead: I("zap"), title: "Con Edison", sub: "Mon 22 Sep · bill · estimated", right: m(112.0), rightSub: "est.", tone: "--cat-6" })}
      ${listRow({ lead: I("trending-down"), title: "Auto loan", sub: "Wed 24 Sep · debt payment", right: m(384.22), tone: "--cat-2" })}
      ${listRow({ lead: I("wallet"), title: "Salary · Northwind", sub: "Tue 30 Sep · recurring income", right: `<span class="num num--in">+3,210<span class="num__frac">.00</span></span>`, tone: "--cat-3" })}
    </div>
  </section>
</div>
</main>`,
};

export default [dashboard, transactions, transactionDetail, quickAdd, accounts, accountDetail, calendar];
