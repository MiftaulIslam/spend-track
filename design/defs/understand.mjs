import { I, m, appbar, meter, bars, spark, donut, stat, empty, callout, listRow, txn } from "../kit.mjs";

const addBtn = (l = "New") => `<button class="btn btn--sm btn--primary">${I("plus")} ${l}</button>`;

/* ═════════════════════════════════════════════════════════════ ANALYTICS  */
const analytics = {
  id: "analytics",
  title: "Analytics",
  note: "Cash flow, category trends, merchant leaderboard, net worth, savings rate.",
  body: `
${appbar("Analytics", "Jan – Sep 2025 · USD", `<button class="btn btn--sm btn--secondary">${I("calendar")} Range</button><button class="btn btn--sm btn--ghost">${I("upload")} Export</button>`)}
<main class="main">
<div class="container">
  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">Cash flow</button>
    <button class="chip">Categories</button>
    <button class="chip">Merchants</button>
    <button class="chip">Net worth</button>
    <button class="chip">Savings</button>
    <button class="chip">Accounts</button>
    <button class="chip">Comparison</button>
  </div>

  <div class="statgrid mt-2">
    ${stat("Income YTD", m(54180.0), "+8.4% vs 2024", "up")}
    ${stat("Expenses YTD", m(38914.22), "+3.1% vs 2024", "down")}
    ${stat("Net saved", m(15265.78), "28.2% rate", "up")}
    ${stat("Avg monthly burn", m(4323.8), "−$182 vs 2024", "up")}
  </div>

  <!-- Cash flow: in and out as opposing bars with net line. The comparison
       people actually want is "did more come in than went out, and by how much". -->
  <section class="section">
    <div class="section__head"><h2 class="section__title">Monthly cash flow</h2><span class="section__meta">9 months</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:20px">
      <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:8px;align-items:end;height:180px">
        ${[[6100,4210],[5900,4620],[6400,3980],[5800,4410],[6200,4890],[6050,4120],[6300,4340],[6170,4520],[6420,4194]].map(([inc, exp], i) => {
          const max = 7000;
          return `<div style="display:flex;gap:2px;align-items:end;height:100%">
            <div class="chart__bar" style="--i:${i};height:${(inc/max)*100}%;--bar:var(--inflow);flex:1"></div>
            <div class="chart__bar" style="--i:${i};height:${(exp/max)*100}%;--bar:var(--outflow);flex:1;opacity:.85"></div>
          </div>`;
        }).join("")}
      </div>
      <div class="chart__axis">${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"].map(x => `<span>${x}</span>`).join("")}</div>
      <div class="row gap-4 mt-3 tiny">
        <span class="row gap-2"><i style="width:9px;height:9px;border-radius:2px;background:var(--inflow)"></i>Income</span>
        <span class="row gap-2"><i style="width:9px;height:9px;border-radius:2px;background:var(--outflow)"></i>Expenses</span>
        <span class="grow"></span><span class="muted">Positive in 9 of 9 months</span>
      </div>
    </div></div>
  </section>

  <div class="grid-auto">
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Category trend</h2><span class="panel__action muted">Top 4</span></div>
      <div class="panel__body">
        ${[["Food & dining", 1300.06, 1180, 1, 10.2],["Housing", 922.63, 920, 4, 0.3],["Groceries", 670.99, 742, 3, -9.6],["Transport", 503.25, 441, 2, 14.1]].map(([name, cur, prev, cat, delta]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--rule-faint)">
          <div class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-${cat})"></span>
            <span style="font-size:var(--text-sm)">${name}</span><span class="grow"></span>
            <span class="num" style="font-size:var(--text-sm)">${m(cur)}</span>
            <span class="tiny" style="color:var(--${delta > 0 ? "outflow" : "inflow"});width:52px;text-align:right">${delta > 0 ? "+" : ""}${delta}%</span></div>
          <div class="mt-2">${meter(Math.min((cur / 1400) * 100, 100), delta > 8 ? "warn" : "ok")}</div>
        </div>`).join("")}
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Top merchants</h2><span class="panel__action muted">This year</span></div>
      <div class="panel__body">
        <table class="table">
          <thead><tr><th>Merchant</th><th class="n">Visits</th><th class="n">Total</th></tr></thead>
          <tbody>
            ${[["Whole Foods Market", 68, 4218.4],["Equinox", 9, 1935.0],["Amazon", 41, 1682.33],["Uber", 94, 1104.6],["Blue Bottle Coffee", 121, 812.75],["Lilia", 6, 742.0]].map(([n2, v, t]) =>
              `<tr><td>${n2}</td><td class="n">${v}</td><td class="n">${m(t)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Savings rate</h2><span class="section__meta">Target 25%</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${bars([31,22,38,24,21,32,31,27,35], "--inflow")}
      <div class="chart__axis">${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"].map(x => `<span>${x}</span>`).join("")}</div>
      <p class="tiny muted mt-3">Savings rate = (income − expenses) ÷ income, excluding transfers between your own accounts and credit-card payments. Two months fell below the 25% target.</p>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Year over year</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:8px">
      <table class="table">
        <thead><tr><th></th><th class="n">2024</th><th class="n">2025</th><th class="n">Change</th></tr></thead>
        <tbody>
          ${[["Income", 49980, 54180],["Expenses", 37744, 38914],["Savings", 12236, 15266],["Subscriptions", 2618, 3412],["Dining", 3990, 4460],["Debt interest", 1842, 1204]].map(([k, a, b]) => {
            const d = (((b - a) / a) * 100).toFixed(1);
            const good = k === "Income" || k === "Savings" ? b > a : b < a;
            return `<tr><td>${k}</td><td class="n muted">${m(a)}</td><td class="n">${m(b)}</td><td class="n" style="color:var(--${good ? "inflow" : "outflow"})">${d > 0 ? "+" : ""}${d}%</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </div></div>
  </section>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════ REPORTS  */
const reports = {
  id: "reports",
  title: "Reports",
  note: "Generated report library with export to CSV, XLSX, PDF and JSON.",
  body: `
${appbar("Reports", "8 templates · 14 generated", addBtn("Report"))}
<main class="main">
<div class="container">
  <section class="section" style="margin-top:20px">
    <div class="section__head"><h2 class="section__title">Generate</h2></div>
    <div class="grid-auto">
      ${[
        ["Monthly statement", "Income, expenses, category breakdown and account movement for one month.", "file"],
        ["Annual summary", "Full-year totals with month-by-month comparison and top movers.", "chart"],
        ["Category report", "Every transaction grouped by category with subtotals.", "tag"],
        ["Cash flow", "Opening balance, inflows, outflows, closing balance per account.", "activity"],
        ["Net worth", "Assets and liabilities over time with composition changes.", "trending-down"],
        ["Tax-style summary", "Deductible-flagged spend, income by source, reimbursements.", "shield"],
        ["Subscription audit", "All recurring services, annualised cost, usage signals.", "repeat"],
        ["Reimbursement", "Outstanding and settled reimbursable transactions.", "handshake"],
      ].map(([t, d, ic]) => `
      <button class="panel" style="text-align:left;cursor:pointer;border:1px solid var(--rule);background:var(--surface)">
        <div class="panel__head"><span class="txn__icon" style="--cat:var(--ink-secondary);width:28px;height:28px">${I(ic)}</span>
          <h3 class="panel__title">${t}</h3></div>
        <div class="panel__body"><p class="tiny muted" style="line-height:1.5">${d}</p></div>
      </button>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Recent</h2><span class="section__meta">Kept for 90 days</span></div>
    <div class="panel">
      <table class="table">
        <thead><tr><th>Report</th><th>Period</th><th>Format</th><th>Generated</th><th class="n">Size</th><th></th></tr></thead>
        <tbody>
          ${[
            ["Monthly statement", "Aug 2025", "PDF", "01 Sep 06:00", "284 KB", "ready"],
            ["Category report", "Q3 2025", "XLSX", "15 Sep 11:42", "62 KB", "ready"],
            ["Annual summary", "2024", "PDF", "12 Jan 09:14", "1.1 MB", "ready"],
            ["Full data export", "All time", "JSON", "17 Sep 08:30", "—", "building"],
          ].map(([r, p, f, g, s, st]) => `
          <tr><td>${r}</td><td class="muted">${p}</td><td><span class="badge">${f}</span></td>
            <td class="muted num">${g}</td><td class="n muted">${s}</td>
            <td style="text-align:right">${st === "ready" ? '<button class="btn btn--sm btn--ghost">Download</button>' : '<span class="badge badge--warn">Building…</span>'}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Scheduled delivery</h2></div>
    <div class="panel">
      ${listRow({ lead: I("calendar"), title: "Monthly statement", sub: "1st of each month · PDF · email", right: "On", tone: "--inflow" })}
      ${listRow({ lead: I("calendar"), title: "Weekly brief", sub: "Mondays 06:00 · in-app + push", right: "On", tone: "--inflow" })}
      ${listRow({ lead: I("calendar"), title: "Annual summary", sub: "5 January · PDF · email", right: "On", tone: "--inflow" })}
    </div>
  </section>
</div>
</main>`,
};

/* ═════════════════════════════════════════════════════════════ ASSISTANT  */
const assistant = {
  id: "assistant",
  title: "AI assistant",
  note: "Grounded Q&A, tool calls shown inline, mutations gated behind confirmation.",
  body: `
${appbar("Assistant", "Claude · grounded on your data", `<button class="btn btn--sm btn--ghost">${I("history")} History</button><button class="btn btn--sm btn--ghost">${I("plus")} New</button>`)}
<main class="main" style="padding-bottom:180px">
<div class="container" style="max-width:760px">

  <div class="ai-msg ai-msg--user">
    <span class="ai-msg__avatar">MI</span>
    <div class="ai-msg__body">How much did I spend on food last month compared to my budget, and which restaurants drove it?</div>
  </div>

  <div class="ai-msg ai-msg--ai">
    <span class="ai-msg__avatar">C</span>
    <div class="ai-msg__body">
      <!-- Tool calls are visible, not hidden. The user can audit exactly which
           data the model was given and re-run the query themselves. -->
      <div class="ai-tool">
        <div class="ai-tool__head">${I("db")}<span class="ai-tool__name">search_transactions</span>
          <span class="ai-tool__status badge badge--in">${I("check")} 64 rows · 82 ms</span></div>
        <div class="ai-tool__body num muted" style="font-size:var(--text-2xs)">{ dateFrom: "2025-08-01", dateTo: "2025-08-31", categories: ["dining-out","coffee-shops","groceries"], type: "EXPENSE" }</div>
      </div>
      <div class="ai-tool">
        <div class="ai-tool__head">${I("target")}<span class="ai-tool__name">search_budgets</span>
          <span class="ai-tool__status badge badge--in">${I("check")} 3 rows · 31 ms</span></div>
        <div class="ai-tool__body num muted" style="font-size:var(--text-2xs)">{ period: "2025-08", categories: ["dining-out","groceries"] }</div>
      </div>

      <p class="mt-3">In August you spent <b>${m(1180.44)}</b> across food categories against a combined budget of
        <b>${m(880).replace(/<[^>]+>/g, "")}</b> — <b style="color:var(--outflow)">${m(300.44).replace(/<[^>]+>/g, "")} over</b>.
        Dining out was the whole overage; groceries came in ${m(71.01).replace(/<[^>]+>/g, "")} under.</p>

      <div class="panel mt-3">
        <table class="table">
          <thead><tr><th>Restaurant</th><th class="n">Visits</th><th class="n">Total</th></tr></thead>
          <tbody>
            <tr><td>Lilia</td><td class="n">2</td><td class="n">${m(248.0)}</td></tr>
            <tr><td>Di An Di</td><td class="n">3</td><td class="n">${m(186.5)}</td></tr>
            <tr><td>Blue Bottle Coffee</td><td class="n">18</td><td class="n">${m(121.5)}</td></tr>
            <tr><td>Everything else</td><td class="n">22</td><td class="n">${m(232.44)}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3">Three weekend dinners account for 58% of the dining overage. Your July dining
        total was ${m(291.2).replace(/<[^>]+>/g, "")}, so August was an outlier rather than a trend.</p>
      <div class="row gap-2 mt-3" style="flex-wrap:wrap">
        <button class="chip">Show those transactions</button>
        <button class="chip">Compare to last 6 months</button>
        <button class="chip">Raise the dining budget</button>
      </div>
    </div>
  </div>

  <div class="ai-msg ai-msg--user">
    <span class="ai-msg__avatar">MI</span>
    <div class="ai-msg__body">Raise my dining budget to $340 starting October.</div>
  </div>

  <!-- Every mutation stops here. The model proposes; the person commits. -->
  <div class="ai-msg ai-msg--ai">
    <span class="ai-msg__avatar">C</span>
    <div class="ai-msg__body">
      <p>Here's the change I'd make. Nothing is saved until you confirm.</p>
      <div class="ai-confirm">
        <div class="ai-confirm__title">${I("shield")} Confirm budget change</div>
        <dl class="ai-confirm__rows">
          <div class="ai-confirm__row"><dt>Budget</dt><dd>Dining out · monthly</dd></div>
          <div class="ai-confirm__row"><dt>Current</dt><dd class="num">${m(280.0)}</dd></div>
          <div class="ai-confirm__row"><dt>New</dt><dd class="num">${m(340.0)}</dd></div>
          <div class="ai-confirm__row"><dt>Effective</dt><dd>1 October 2025 · future periods only</dd></div>
          <div class="ai-confirm__row"><dt>Impact</dt><dd>Overall monthly budget rises to ${m(5260).replace(/<[^>]+>/g, "")}</dd></div>
        </dl>
        <div class="ai-confirm__actions">
          <button class="btn btn--sm btn--primary">${I("check")} Apply change</button>
          <button class="btn btn--sm btn--secondary">Edit first</button>
          <button class="btn btn--sm btn--ghost">Cancel</button>
        </div>
      </div>
      <p class="tiny muted mt-2">Applied through the normal budget service with your permissions — the model never writes to the database directly.</p>
    </div>
  </div>

  <div class="ai-msg ai-msg--ai">
    <span class="ai-msg__avatar">C</span>
    <div class="ai-msg__body"><span class="typing"><i></i><i></i><i></i></span></div>
  </div>
</div>
</main>

<div style="position:fixed;bottom:calc(var(--tabbar-h) + var(--safe-bottom));inset-inline:0;z-index:30;background:linear-gradient(to top, var(--paper) 60%, transparent);padding:16px">
  <div class="container" style="max-width:760px;padding-inline:0">
    <div class="row gap-2 mb-2" style="overflow-x:auto;scrollbar-width:none">
      <button class="chip">What can I cut?</button>
      <button class="chip">Am I on track for Japan?</button>
      <button class="chip">Log $12 lunch on Amex</button>
      <button class="chip">Any unusual charges?</button>
    </div>
    <div class="row gap-2" style="background:var(--surface);border:1px solid var(--rule-strong);border-radius:var(--radius-lg);padding:6px 6px 6px 14px">
      <input class="input" style="border:0;background:none;height:36px;padding:0" placeholder="Ask about your money…">
      <button class="btn btn--icon btn--ghost" aria-label="Attach receipt">${I("camera","navitem__icon")}</button>
      <button class="btn btn--icon btn--primary" aria-label="Send">${I("arrow","navitem__icon")}</button>
    </div>
    <p class="tiny muted mt-2" style="text-align:center">Read-only answers run immediately. Anything that changes your data asks first.</p>
  </div>
</div>`,
};

export default [analytics, reports, assistant];
