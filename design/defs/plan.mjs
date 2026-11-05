import { I, m, appbar, meter, bars, spark, donut, stat, empty, callout, listRow, txn } from "../kit.mjs";

const moreBtn = `<button class="btn btn--icon btn--ghost" aria-label="More">${I("more", "navitem__icon")}</button>`;
const addBtn = (label = "New") => `<button class="btn btn--sm btn--primary">${I("plus")} ${label}</button>`;

/* ═══════════════════════════════════════════════════════════════ BUDGETS  */
const budgets = {
  id: "budgets",
  title: "Budgets",
  note: "Period budgets with pace marker, rollover, and per-category drill-down.",
  body: `
${appbar("Budgets", "September · 13 days left", `${addBtn("Budget")}`)}
<main class="main">
<div class="container">
  <section style="padding:20px 0 8px">
    <div class="eyebrow">Overall · monthly</div>
    <div class="row gap-3 mt-2" style="align-items:baseline">
      <span class="display">${m(4193.76)}</span>
      <span class="muted">of ${m(5200).replace(/<[^>]+>/g, "")}</span>
    </div>
    <div class="mt-4">${meter(80.6, "warn", 56.7)}</div>
    <div class="row tiny mt-2">
      <span class="muted">80.6% spent</span><span class="grow"></span>
      <span class="muted">Pace marker: 56.7% of month</span>
    </div>
    ${callout("warn", "alert", `Spending is <b>24 points ahead of pace</b>. At this rate September closes at ${m(7400).replace(/<[^>]+>/g, "")} — ${m(2200).replace(/<[^>]+>/g, "")} over.`).replace('class="callout', 'class="callout mt-4"').replace('mt-4""', 'mt-4"')}
  </section>

  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">Monthly</button>
    <button class="chip">Weekly</button>
    <button class="chip">Annual</button>
    <button class="chip">Custom period</button>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">By category</h2><span class="section__meta">9 budgets</span></div>
    <div class="panel">
      ${/* cat index is the category's own colour, not its position in this list */[
        ["Dining out", 348.15, 280, "over", "Rollover +$40 from August applied", 1],
        ["Groceries", 512.4, 600, "warn", "Tracking 4% above pace", 3],
        ["Housing", 1650.0, 1650, "ok", "Fixed · fully allocated", 4],
        ["Transport", 96.5, 220, "ok", "Under pace by 12 points", 2],
        ["Utilities", 419.38, 400, "over", "Con Edison seasonal spike", 6],
        ["Entertainment", 88.0, 150, "ok", "", 5],
        ["Health", 24.73, 200, "ok", "Rolls over to October", 8],
        ["Shopping", 172.5, 300, "ok", "", 7],
        ["Personal care", 62.1, 100, "ok", "", 10],
      ].map(([name, spent, limit, tone, note, cat]) => `
      <a class="budget-row" href="#">
        <div class="budget-row__top">
          <span class="chip__dot" style="--cat:var(--cat-${cat})"></span>
          <span class="budget-row__name">${name}</span>
          <span class="budget-row__amt"><b>${m(spent)}</b> <span>/ ${m(limit)}</span></span>
        </div>
        ${meter((spent / limit) * 100, tone, 56.7)}
        <div class="budget-row__foot">
          <span${tone === "over" ? ' style="color:var(--danger)"' : ""}>${
            spent > limit ? `Over by ${m(spent - limit).replace(/<[^>]+>/g, "")}` : `${m(limit - spent).replace(/<[^>]+>/g, "")} left`
          }${note ? ` · ${note}` : ""}</span>
          <span>${Math.round((spent / limit) * 100)}%</span>
        </div>
      </a>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Six-month adherence</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${bars([92, 104, 88, 97, 112, 81], "--transfer")}
      <div class="chart__axis"><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span></div>
      <p class="tiny muted mt-3">Bars show spend as a percentage of budget. Two of the last six months closed over.</p>
    </div></div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════════════ GOALS */
const goals = {
  id: "goals",
  title: "Goals",
  note: "Target, deadline, contribution cadence, milestones, projected completion.",
  body: `
${appbar("Goals", "4 active · $18,420 saved", addBtn("Goal"))}
<main class="main">
<div class="container">
  <section class="section" style="margin-top:20px">
    <div class="panel" style="border-color:var(--brass-rule)">
      <div class="panel__head">
        <span class="txn__icon" style="--cat:var(--cat-11)">${I("flag")}</span>
        <div class="col"><h2 class="panel__title">Japan, spring 2026</h2>
          <span class="tiny muted">Target 12 Mar 2026 · 176 days left</span></div>
        <span class="panel__action">${moreBtn}</span>
      </div>
      <div class="panel__body">
        <div class="row" style="align-items:baseline">
          <span class="display" style="font-size:var(--text-xl)">${m(3840.0)}</span>
          <span class="muted" style="margin-left:8px">of ${m(6000).replace(/<[^>]+>/g, "")}</span>
          <span class="grow"></span><span class="num tiny muted">64%</span>
        </div>
        <div class="mt-3">${meter(64, "ok")}</div>
        <div class="row gap-4 mt-4 tiny">
          <div class="col"><span class="eyebrow">Contributing</span><span class="num mt-1">${m(400)}/mo</span></div>
          <div class="col"><span class="eyebrow">On track for</span><span class="num mt-1">02 Mar 2026</span></div>
          <div class="col"><span class="eyebrow">Needs</span><span class="num mt-1">${m(360)}/mo</span></div>
        </div>
        <div class="row gap-2 mt-4" style="flex-wrap:wrap">
          <button class="btn btn--sm btn--primary">Contribute</button>
          <button class="btn btn--sm btn--secondary">Adjust plan</button>
          <button class="btn btn--sm btn--ghost">Pause</button>
        </div>
      </div>
      <div class="panel__foot">
        <div class="eyebrow mb-2">Milestones</div>
        <div class="row gap-2" style="flex-wrap:wrap">
          <span class="badge badge--in">${I("check")} Flights $1,200</span>
          <span class="badge badge--in">${I("check")} Rail pass $600</span>
          <span class="badge badge--brass">Lodging $2,400 · 85%</span>
          <span class="badge">Spending money $1,800</span>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Other goals</h2></div>
    <div class="panel">
      ${[
        ["Emergency fund", 12400, 20000, "Ally Savings", "62%", "--cat-3"],
        ["New laptop", 1180, 2400, "Ally Savings", "49%", "--cat-6"],
        ["Wedding gift fund", 1000, 1000, "Cash", "Complete", "--cat-10"],
      ].map(([name, cur, target, acct, pct, color]) => `
      <a class="budget-row" href="#">
        <div class="budget-row__top">
          <span class="chip__dot" style="--cat:var(${color})"></span>
          <span class="budget-row__name">${name}</span>
          <span class="budget-row__amt"><b>${m(cur)}</b> <span>/ ${m(target)}</span></span>
        </div>
        ${meter((cur / target) * 100, cur >= target ? "ok" : "ok")}
        <div class="budget-row__foot"><span>${acct}</span><span>${pct}</span></div>
      </a>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Projection</h2><span class="section__meta">All goals</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${spark([18420, 19220, 20020, 20820, 21620, 22420, 23220, 24020, 24820, 25620, 26420, 27220], "--inflow", 320, 80)}
      <div class="chart__axis"><span>Sep</span><span>Dec</span><span>Mar</span><span>Jun</span><span>Aug</span></div>
      <p class="tiny muted mt-3">Assumes current contribution rates continue and no withdrawals. Recomputed nightly from actual contributions, never estimated by the model.</p>
    </div></div>
  </section>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════════ BILLS */
const bills = {
  id: "bills",
  title: "Bills",
  note: "Due dates, overdue escalation, estimated vs actual, mark-paid flow.",
  body: `
${appbar("Bills", "2 due this week · 1 overdue", addBtn("Bill"))}
<main class="main">
<div class="container">
  ${callout("danger", "alert", `<b>Internet · Verizon Fios</b> was due 12 Sep and is 5 days overdue. <a href="#" style="text-decoration:underline">Mark paid</a> or <a href="#" style="text-decoration:underline">snooze</a>.`).replace('class="callout', 'class="callout" style="margin-top:16px"').replace('callout" style', 'callout callout--danger" style')}

  <div class="statgrid mt-4">
    ${stat("Due this month", m(2946.21), "11 bills")}
    ${stat("Paid", m(1184.21), "6 bills")}
    ${stat("Remaining", m(1762.0), "5 bills")}
    ${stat("Average monthly", m(2810.4), "last 6 months")}
  </div>

  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">Upcoming</button>
    <button class="chip">Overdue <span class="badge badge--danger">1</span></button>
    <button class="chip">Paid</button>
    <button class="chip">All</button>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Overdue</h2></div>
    <div class="panel" style="border-color:color-mix(in oklab, var(--danger) 30%, transparent)">
      ${listRow({ lead: I("zap"), title: "Verizon Fios", sub: "Due 12 Sep · 5 days late · Internet", right: m(89.99), rightSub: "overdue", tone: "--danger" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">This week</h2></div>
    <div class="panel">
      ${listRow({ lead: I("home"), title: "Rent · 214 Bergen St", sub: "Due Fri 19 Sep · monthly · Chase Checking", right: m(1650.0), rightSub: "2 days", tone: "--cat-4" })}
      ${listRow({ lead: I("zap"), title: "Con Edison", sub: "Due Mon 22 Sep · estimated from 6-mo average", right: m(112.0), rightSub: "est.", tone: "--cat-6" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Later this month</h2></div>
    <div class="panel">
      ${listRow({ lead: I("shield"), title: "Renters insurance", sub: "Due 25 Sep · monthly · auto-pay", right: m(18.5), tone: "--cat-8" })}
      ${listRow({ lead: I("receipt"), title: "Amex Gold statement", sub: "Due 02 Oct · minimum $86.00", right: m(2411.18), rightSub: "statement", tone: "--cat-1" })}
      ${listRow({ lead: I("users"), title: "Gym · Equinox", sub: "Due 28 Sep · monthly", right: m(215.0), tone: "--cat-9" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Estimated vs actual</h2><span class="section__meta">Con Edison · 12 months</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${bars([78, 84, 96, 141, 168, 152, 119, 104, 88, 92, 106, 112], "--cat-6")}
      <div class="chart__axis"><span>Oct</span><span>Jan</span><span>Apr</span><span>Jul</span><span>Sep</span></div>
      <p class="tiny muted mt-3">Variable bills are estimated from the trailing 6-month mean, seasonally weighted. Estimates never post as transactions until confirmed.</p>
    </div></div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════ SUBSCRIPTIONS */
const subscriptions = {
  id: "subscriptions",
  title: "Subscriptions",
  note: "Normalised monthly cost, trials, renewal risk, unused-service detection.",
  body: `
${appbar("Subscriptions", "14 active · $284.37/mo", addBtn("Subscription"))}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("Monthly", m(284.37), "+$18.99 vs Aug", "down")}
    ${stat("Annualised", m(3412.44), "6.4% of income")}
    ${stat("Trials ending", "2", "within 9 days", "down")}
    ${stat("Unused 60d+", "3", m(64.97) + "/mo", "down")}
  </div>

  ${callout("brass", "sparkle", `Three services show no linked activity in 60+ days. Cancelling all three saves <b>${m(779.64).replace(/<[^>]+>/g, "")}/yr</b>. <a href="assistant.html" style="text-decoration:underline">Review with assistant</a>`).replace('class="callout', 'class="callout mt-4"').replace('mt-4""', 'mt-4"')}

  <section class="section">
    <div class="section__head"><h2 class="section__title">Trials ending soon</h2></div>
    <div class="panel" style="border-color:var(--brass-rule)">
      ${listRow({ lead: I("sparkle"), title: "Notion AI", sub: "Trial ends 20 Sep → $10.00/mo · Amex Gold", right: m(0), rightSub: "3 days", tone: "--brass" })}
      ${listRow({ lead: I("chart"), title: "Figma Professional", sub: "Trial ends 26 Sep → $15.00/mo · Chase Freedom", right: m(0), rightSub: "9 days", tone: "--brass" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Active</h2><span class="section__meta">Sorted by annual cost</span></div>
    <div class="panel">
      ${[
        ["Equinox", "Monthly · 28th · Chase Checking", 215.0, 2580.0, "--cat-8", ""],
        ["Adobe Creative Cloud", "Monthly · 17th · Amex Gold", 59.99, 719.88, "--cat-5", ""],
        ["iCloud+ 2TB", "Monthly · 3rd · Amex Gold", 9.99, 119.88, "--cat-6", ""],
        ["Spotify Family", "Monthly · 20th · Amex Gold", 19.99, 239.88, "--cat-5", "1 of 6 profiles used since June"],
        ["New York Times", "Annual · renews 14 Jan · Amex Gold", 17.0, 204.0, "--cat-9", ""],
        ["Dropbox Plus", "Annual · renews 02 Nov · Chase Freedom", 9.99, 119.88, "--cat-12", "No file activity in 94 days"],
        ["Headspace", "Monthly · 8th · Amex Gold", 12.99, 155.88, "--cat-10", "No sessions in 71 days"],
      ].map(([name, sub, mo, yr, color, warn]) => `
      <a class="txn" href="#">
        <span class="txn__icon" style="--cat:var(${color})">${I("repeat")}</span>
        <span class="txn__body">
          <span class="txn__name">${name}${warn ? ` <span class="badge badge--warn" style="margin-left:6px">unused</span>` : ""}</span>
          <span class="txn__meta"><span>${sub}</span>${warn ? `<span>${warn}</span>` : ""}</span>
        </span>
        <span class="txn__col hide-mobile">${sub.split(" · ")[0]}</span>
        <span class="txn__col hide-mobile">${warn || "Active"}</span>
        <span class="txn__amount">${m(mo)}<small>${m(yr).replace(/<[^>]+>/g, "")}/yr</small></span>
      </a>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Subscription spend</h2><span class="section__meta">12 months</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${bars([218, 224, 231, 231, 244, 251, 251, 266, 266, 266, 265, 284], "--cat-5")}
      <div class="chart__axis"><span>Oct</span><span>Jan</span><span>Apr</span><span>Jul</span><span>Sep</span></div>
      <p class="tiny muted mt-3">Up 30% year over year, driven by three price increases and two new services.</p>
    </div></div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════════ RECURRING */
const recurring = {
  id: "recurring",
  title: "Recurring",
  note: "Schedules with pause/skip/resume, fixed vs variable amount, next runs.",
  body: `
${appbar("Recurring", "12 schedules · next in 2 days", addBtn("Schedule"))}
<main class="main">
<div class="container">
  ${callout("info", "info", `SpendTrack detected <b>2 new recurring patterns</b> from your transaction history. <a href="#" style="text-decoration:underline">Review suggestions</a>`).replace('class="callout', 'class="callout mt-4"').replace('mt-4""', 'mt-4"')}

  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">All</button>
    <button class="chip">Expenses</button>
    <button class="chip">Income</button>
    <button class="chip">Transfers</button>
    <button class="chip">Paused <span class="badge">2</span></button>
  </div>

  <section class="section">
    <div class="panel">
      ${[
        ["Salary · Northwind Labs", "Monthly on the last weekday", "30 Sep", 3210.0, "in", "--cat-3", "fixed"],
        ["Rent · 214 Bergen St", "Monthly on the 1st", "01 Oct", 1650.0, "out", "--cat-4", "fixed"],
        ["To Emergency Fund", "Biweekly on Friday", "26 Sep", 250.0, "xfer", "--cat-3", "fixed"],
        ["Con Edison", "Monthly on the 22nd", "22 Sep", 112.0, "out", "--cat-6", "variable"],
        ["Auto loan · Toyota", "Monthly on the 24th", "24 Sep", 384.22, "out", "--cat-2", "fixed"],
        ["Freelance retainer · Vireo", "Monthly on the 16th", "16 Oct", 3200.0, "in", "--cat-3", "variable"],
        ["Cleaning service", "Every 2 weeks on Thursday", "25 Sep", 140.0, "out", "--cat-4", "fixed"],
      ].map(([name, cadence, next, amt, dir, color, kind]) => `
      <a class="txn" href="#">
        <span class="txn__icon" style="--cat:var(${color})">${I("rotate")}</span>
        <span class="txn__body">
          <span class="txn__name">${name}</span>
          <span class="txn__meta"><span>${cadence}</span><span>Next ${next}</span></span>
        </span>
        <span class="txn__col hide-mobile">${cadence}</span>
        <span class="txn__col hide-mobile">Next ${next}</span>
        <span class="txn__amount ${dir === "in" ? "txn__amount--in" : dir === "xfer" ? "txn__amount--xfer" : ""}">
          ${m(amt, { sign: dir === "in" ? "+" : dir === "xfer" ? "" : "−" })}<small>${kind}</small></span>
      </a>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Paused</h2></div>
    <div class="panel" style="opacity:.62">
      ${listRow({ lead: I("rotate"), title: "Storage unit", sub: "Monthly on the 5th · paused 12 Aug", right: m(85.0), rightSub: "paused", tone: "--cat-12" })}
      ${listRow({ lead: I("rotate"), title: "Language tutor", sub: "Weekly on Tuesday · paused 01 Sep", right: m(60.0), rightSub: "paused", tone: "--cat-9" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Schedule editor</h2><span class="section__meta">Preview</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-3">
        <label class="field"><span class="field__label">Frequency</span>
          <div class="row gap-2" style="flex-wrap:wrap">
            ${["Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Yearly", "Custom"].map((f, i) =>
              `<button class="chip"${i === 3 ? ' aria-pressed="true"' : ""}>${f}</button>`).join("")}
          </div></label>
        <div class="grid-2">
          <label class="field"><span class="field__label">Day of month</span><input class="input input--num" value="24"></label>
          <label class="field"><span class="field__label">If weekend</span>
            <select class="input"><option>Move to previous weekday</option><option>Move to next weekday</option><option>Keep the date</option></select></label>
        </div>
        <div class="grid-2">
          <label class="field"><span class="field__label">Starts</span><input class="input input--num" type="date" value="2024-03-24"></label>
          <label class="field"><span class="field__label">Ends</span><input class="input input--num" type="date" value="2028-05-24"></label>
        </div>
        <label class="field"><span class="field__label">Amount behaviour</span>
          <div class="row gap-2"><button class="chip" aria-pressed="true">Fixed ${m(384.22).replace(/<[^>]+>/g, "")}</button><button class="chip">Variable · estimate from history</button></div></label>
        <div class="callout callout--info">${I("info")}<div>Next 3 runs: <b>24 Sep</b>, <b>24 Oct</b>, <b>24 Nov</b>. Created 2 days ahead as pending so you can adjust before they post.</div></div>
      </div>
    </div></div>
  </section>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════════ DEBT */
const debts = {
  id: "debts",
  title: "Debt",
  note: "Balances, APR, amortisation, payoff strategies (avalanche vs snowball).",
  body: `
${appbar("Debt", "$15,449.80 across 3 accounts", addBtn("Debt"))}
<main class="main">
<div class="container">
  <section style="padding:20px 0">
    <div class="eyebrow">Total debt</div>
    <div class="display mt-2">${m(15449.8)}</div>
    <div class="row gap-2 mt-2 tiny">
      <span class="badge badge--in">${I("arrow-down")} −$1,842 this year</span>
      <span class="muted">Weighted APR 11.4%</span>
    </div>
    <div class="mt-4">${spark([19200, 18900, 18400, 18100, 17700, 17300, 16900, 16600, 16200, 15900, 15700, 15449], "--inflow", 320, 64)}</div>
  </section>

  <div class="statgrid">
    ${stat("Monthly minimum", m(552.22), "3 accounts")}
    ${stat("You pay", m(900.0), "+$347.78 extra")}
    ${stat("Debt-free", "Nov 2028", "38 months")}
    ${stat("Interest saved", m(2184.0), "vs minimums")}
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Payoff strategy</h2><span class="section__meta">Avalanche</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="row gap-2 mb-4">
        <button class="chip" aria-pressed="true">Avalanche · highest APR first</button>
        <button class="chip">Snowball · smallest balance first</button>
        <button class="chip">Custom</button>
      </div>
      <table class="table">
        <thead><tr><th>Debt</th><th>APR</th><th class="n">Balance</th><th class="n">Payment</th><th>Clear by</th></tr></thead>
        <tbody>
          <tr><td><span class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-1)"></span>Amex Gold</span></td><td class="num">24.74%</td><td class="n">${m(2860.4)}</td><td class="n">${m(515.78)}</td><td>Mar 2026</td></tr>
          <tr><td><span class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-2)"></span>Auto loan</span></td><td class="num">4.90%</td><td class="n">${m(12240.0)}</td><td class="n">${m(384.22)}</td><td>Nov 2028</td></tr>
          <tr><td><span class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-5)"></span>Chase Freedom</span></td><td class="num">0.00%</td><td class="n">${m(349.4)}</td><td class="n">${m(0)}</td><td>Mar 2026 · promo</td></tr>
        </tbody>
      </table>
      <p class="tiny muted mt-3">Amortisation computed server-side with exact integer-cent arithmetic. Switching to snowball costs <b>${m(412).replace(/<[^>]+>/g, "")}</b> more interest but clears one account 4 months sooner.</p>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Auto loan · Toyota</h2><span class="section__meta">34 of 60 payments made</span></div>
    <div class="panel">
      <div class="panel__body" style="padding-top:16px">
        ${meter(43, "ok")}
        <div class="row tiny mt-2"><span class="muted">${m(9360).replace(/<[^>]+>/g, "")} paid of ${m(21600).replace(/<[^>]+>/g, "")}</span><span class="grow"></span><span class="muted">43%</span></div>
      </div>
      ${listRow({ lead: I("check"), title: "Payment · 24 Aug", sub: "Principal $334.22 · Interest $50.00", right: m(384.22), tone: "--inflow" })}
      ${listRow({ lead: I("check"), title: "Payment · 24 Jul", sub: "Principal $332.85 · Interest $51.37", right: m(384.22), tone: "--inflow" })}
      ${listRow({ lead: I("check"), title: "Payment · 24 Jun", sub: "Principal $331.49 · Interest $52.73", right: m(384.22), tone: "--inflow" })}
    </div>
  </section>
</div>
</main>`,
};

/* ════════════════════════════════════════════════════════════════ LENDING */
const lending = {
  id: "lending",
  title: "Lending",
  note: "Money lent and borrowed between people, with partial repayments.",
  body: `
${appbar("Lending", "$310 owed to you · $0 owed by you", addBtn("Record"))}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("Owed to you", m(310.0), "3 people", "up")}
    ${stat("You owe", m(0.0), "settled")}
    ${stat("Written off", m(45.0), "1 record")}
    ${stat("Settled this year", m(1284.0), "9 records")}
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Owed to you</h2></div>
    <div class="panel">
      ${[
        ["Ayesha R.", "Dinner at Lilia · 15 Sep · reminded once", 90.0, 0, "--cat-1"],
        ["Dan M.", "Concert tickets · 02 Aug · $120 of $220 repaid", 100.0, 54, "--cat-5"],
        ["Priya S.", "Flight split · 14 Jun · no repayments", 120.0, 0, "--cat-11"],
      ].map(([who, sub, amt, pct, color]) => `
      <div class="budget-row">
        <div class="budget-row__top">
          <span class="txn__icon" style="--cat:var(${color});width:28px;height:28px;font-size:11px">${who.split(" ").map(w => w[0]).join("")}</span>
          <span class="budget-row__name">${who}</span>
          <span class="budget-row__amt"><b>${m(amt)}</b> <span>outstanding</span></span>
        </div>
        ${pct ? meter(pct, "ok") : ""}
        <div class="budget-row__foot"><span>${sub}</span><span><button class="chip" style="height:22px">Record repayment</button></span></div>
      </div>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">You owe</h2></div>
    <div class="panel">
      ${empty("handshake", "Nothing outstanding", "When you borrow money, record it here and repayments will post automatically against the right account.", '<button class="btn btn--secondary btn--sm mt-2">Record borrowing</button>')}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Settled</h2><span class="section__meta">Last 90 days</span></div>
    <div class="panel">
      ${listRow({ lead: "TK", title: "Tomas K.", sub: "Dinner at Lilia · settled via Venmo 16 Sep", right: m(90.0), rightSub: "settled", tone: "--inflow" })}
      ${listRow({ lead: "JL", title: "Jenny L.", sub: "Gift split · settled in cash 04 Sep", right: m(60.0), rightSub: "settled", tone: "--inflow" })}
      ${listRow({ lead: "RB", title: "Rafi B.", sub: "Written off 12 Aug · marked uncollectable", right: m(45.0), rightSub: "written off", tone: "--ink-tertiary" })}
    </div>
  </section>
</div>
</main>`,
};

export default [budgets, goals, bills, subscriptions, recurring, debts, lending];
