import { I, m, appbar, meter, bars, spark, stat, empty, callout, listRow } from "../kit.mjs";

/* Admin uses the same visual world but signals "other side of the glass" with an
   inverted brand block and a persistent scope banner. Never a second design system. */
const adminBanner = `
<div class="row gap-2" style="padding:7px 16px;background:var(--surface-inverse);color:var(--ink-inverse);font-size:var(--text-2xs)">
  ${I("shield","navitem__icon")}<b>Platform administration</b>
  <span style="opacity:.7">·  acting as qa.admin@spendtrack.test · every action here is audited</span>
  <span class="grow"></span><a href="../screens/dashboard.html" style="color:var(--brass-bright)">Leave admin</a>
</div>`;

const adminNav = (cur) => `
<div class="chiprow" style="padding-inline:16px;border-bottom:1px solid var(--rule)">
  ${[["admin-overview","Overview"],["admin-users","Users"],["admin-ai","AI"],["admin-system","System"]].map(([id, l]) =>
    `<a class="chip" href="${id}.html"${id === cur ? ' aria-pressed="true"' : ""}>${l}</a>`).join("")}
  <a class="chip" href="audit.html">Audit</a>
  <a class="chip" href="#">Feature flags</a>
  <a class="chip" href="#">Config</a>
</div>`;

/* ═════════════════════════════════════════════════════════════ OVERVIEW   */
const overview = {
  id: "admin-overview",
  title: "Admin · Overview",
  note: "Platform health at a glance: growth, engagement, AI cost, incidents.",
  body: `${adminBanner}
${appbar("Platform overview", "17 Sep 2025 · last 30 days", `<button class="btn btn--sm btn--secondary">${I("calendar")} Range</button>`)}
${adminNav("admin-overview")}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("DAU", "1,842", "+6.2% WoW", "up")}
    ${stat("WAU", "6,418", "+3.9% WoW", "up")}
    ${stat("MAU", "14,209", "+11.4% MoM", "up")}
    ${stat("DAU / MAU", "13.0%", "stickiness")}
  </div>
  <div class="statgrid mt-3">
    ${stat("Signups (30d)", "1,284", "+18% vs prior", "up")}
    ${stat("D7 retention", "42.8%", "cohort Aug", "up")}
    ${stat("D30 retention", "28.1%", "cohort Jul", "down")}
    ${stat("Churned (30d)", "204", "1.4% of MAU")}
  </div>

  ${callout("danger", "alert", `<b>2 open incidents.</b> Exchange-rate sync failed twice in the last 6 hours (upstream 503). Rates are stale by 9 hours. <a href="admin-system.html" style="text-decoration:underline">Open system health</a>`).replace('class="callout','class="callout mt-4"').replace('mt-4""','mt-4"')}

  <div class="grid-auto mt-4">
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Daily active users</h2><span class="panel__action muted">30 days</span></div>
      <div class="panel__body" style="padding-top:12px">
        ${bars([1420,1480,1390,1510,1620,1180,1090,1560,1610,1580,1640,1690,1240,1150,1710,1740,1690,1780,1810,1320,1210,1790,1820,1800,1840,1860,1390,1280,1870,1842], "--transfer")}
        <div class="chart__axis"><span>18 Aug</span><span>01 Sep</span><span>17 Sep</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Feature adoption</h2><span class="panel__action muted">% of MAU</span></div>
      <div class="panel__body">
        ${[["Transactions",96],["Budgets",71],["AI assistant",58],["Recurring",52],["Receipts",34],["Import",29],["Household",18],["Reconciliation",12]].map(([f, p]) => `
        <div style="padding:8px 0">
          <div class="row tiny"><span>${f}</span><span class="grow"></span><span class="num muted">${p}%</span></div>
          <div class="mt-2">${meter(p, "ok")}</div>
        </div>`).join("")}
      </div>
    </section>
  </div>

  <div class="grid-auto mt-3">
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Ledger volume</h2><span class="panel__action muted">Platform totals</span></div>
      <div class="panel__body">
        <table class="table">
          <tbody>
            ${[["Transactions recorded","4,182,904"],["Accounts","61,842"],["Budgets","48,210"],["Receipts stored","184,022"],["Imports run (30d)","3,912"],["Median txns / active user","284"]].map(([k, v]) =>
              `<tr><td>${k}</td><td class="n num">${v}</td></tr>`).join("")}
          </tbody>
        </table>
        <p class="tiny muted mt-3">Counts only. Administrators cannot read the amount, merchant, note or attachment of any user's transaction — those columns are excluded at the query layer, not just the UI.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">AI cost</h2><a class="panel__action" href="admin-ai.html">Details</a></div>
      <div class="panel__body">
        <div class="row" style="align-items:baseline"><span class="display" style="font-size:var(--text-xl)">${m(1842.4)}</span>
          <span class="muted tiny" style="margin-left:8px">last 30 days</span></div>
        <div class="mt-3">${spark([38,42,51,49,58,61,54,63,68,71,66,74,79,72,81], "--brass", 240, 52)}</div>
        <div class="row gap-4 mt-3 tiny">
          <div class="col"><span class="eyebrow">Per active user</span><span class="num mt-1">${m(0.13)}</span></div>
          <div class="col"><span class="eyebrow">Requests</span><span class="num mt-1">184,022</span></div>
          <div class="col"><span class="eyebrow">Error rate</span><span class="num mt-1">0.41%</span></div>
        </div>
      </div>
    </section>
  </div>
</div>
</main>`,
};

/* ════════════════════════════════════════════════════════════════ USERS  */
const users = {
  id: "admin-users",
  title: "Admin · Users",
  note: "User directory and activity — deliberately without financial detail.",
  body: `${adminBanner}
${appbar("Users", "14,209 monthly active", `<button class="btn btn--sm btn--secondary">${I("filter")} Filter</button><button class="btn btn--sm btn--ghost">${I("upload")} Export</button>`)}
${adminNav("admin-users")}
<main class="main">
<div class="container">
  ${callout("info", "shield", `This directory shows account status and product usage only. Balances, transaction amounts, merchants, notes and attachments are <b>not readable by administrators</b> and are excluded from these queries at the repository layer.`).replace('class="callout','class="callout mt-4"').replace('mt-4""','mt-4"')}

  <div class="row gap-2 mt-4">
    <input class="input" placeholder="Search by email or user ID…" style="flex:1">
    <button class="btn btn--secondary">Search</button>
  </div>

  <section class="section">
    <div class="panel" style="overflow-x:auto">
      <table class="table">
        <thead><tr><th>User</th><th>Status</th><th>Plan</th><th class="n">Txns</th><th class="n">AI reqs</th><th>Last active</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          ${[
            ["a4f2···9c1","qa.owner@spendtrack.test","Active","Free",4182,412,"2 min ago","12 Mar 2024"],
            ["b8e1···2d7","nadia.k@example.com","Active","Pro",1284,89,"18 min ago","04 Jan 2025"],
            ["c9a3···7f4","dan.m@example.com","Active","Free",612,14,"3 hours ago","22 Jun 2025"],
            ["d1b5···8a2","priya.s@example.com","Suspended","Free",84,0,"12 days ago","01 Sep 2025"],
            ["e7c2···3b9","tomas.k@example.com","Active","Pro",2941,204,"Yesterday","18 Nov 2024"],
            ["f2d8···6e1","deleted-user","Deleted","—","—","—","30 Aug 2025","09 Feb 2024"],
          ].map(([id, email, status, plan, txns, ai, active, joined]) => `
          <tr>
            <td><div class="col"><span class="num tiny muted">${id}</span><span>${email}</span></div></td>
            <td><span class="badge ${status === "Active" ? "badge--in" : status === "Suspended" ? "badge--warn" : ""}">${status}</span></td>
            <td class="muted">${plan}</td><td class="n">${txns}</td><td class="n">${ai}</td>
            <td class="muted">${active}</td><td class="muted">${joined}</td>
            <td style="text-align:right"><button class="btn btn--sm btn--ghost">${I("more","navitem__icon")}</button></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Signups &amp; retention</h2></div>
    <div class="grid-auto">
      <div class="panel"><div class="panel__head"><h3 class="panel__title">Daily signups</h3></div>
        <div class="panel__body" style="padding-top:12px">
          ${bars([28,41,38,52,44,19,14,48,55,61,49,58,22,18,64,71,68,74,62,26,21,79,84,81,88,76,31,24,92,84], "--inflow")}
          <div class="chart__axis"><span>18 Aug</span><span>01 Sep</span><span>17 Sep</span></div></div></div>
      <div class="panel"><div class="panel__head"><h3 class="panel__title">Cohort retention</h3></div>
        <div class="panel__body" style="padding-top:8px">
          <table class="table">
            <thead><tr><th>Cohort</th><th class="n">Size</th><th class="n">D1</th><th class="n">D7</th><th class="n">D30</th></tr></thead>
            <tbody>
              ${[["Sep 2025",1284,"68%","44%","—"],["Aug 2025",1088,"71%","42.8%","29.4%"],["Jul 2025",942,"66%","39%","28.1%"],["Jun 2025",810,"64%","37%","26.0%"]].map(r =>
                `<tr><td>${r[0]}</td><td class="n">${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td></tr>`).join("")}
            </tbody></table></div></div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Recent admin actions</h2></div>
    <div class="panel">
      ${listRow({ lead: I("shield"), title: "Suspended d1b5···8a2", sub: "by qa.admin · reason: payment fraud report · 12 Sep 14:02", right: "Suspend", tone: "--warning" })}
      ${listRow({ lead: I("shield"), title: "Reset AI quota for b8e1···2d7", sub: "by qa.admin · support ticket #4821 · 11 Sep 09:31", right: "Quota", tone: "--info" })}
      ${listRow({ lead: I("shield"), title: "Enabled flag ai_agent_beta for 5% of users", sub: "by qa.admin · 09 Sep 16:20", right: "Flag", tone: "--transfer" })}
    </div>
  </section>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════════ AI   */
const ai = {
  id: "admin-ai",
  title: "Admin · AI",
  note: "Token usage, latency, tool-call mix, model split, estimated spend.",
  body: `${adminBanner}
${appbar("AI analytics", "184,022 requests · last 30 days", `<button class="btn btn--sm btn--secondary">${I("calendar")} Range</button>`)}
${adminNav("admin-ai")}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("Requests", "184,022", "+14.2% MoM", "up")}
    ${stat("Estimated cost", m(1842.4), "$0.13 / active user")}
    ${stat("p50 latency", "1,284 ms", "−9% MoM", "up")}
    ${stat("Error rate", "0.41%", "748 failures", "down")}
  </div>
  <div class="statgrid mt-3">
    ${stat("Input tokens", "412.8 M", "avg 2,243 / req")}
    ${stat("Output tokens", "48.2 M", "avg 262 / req")}
    ${stat("Cache read", "284.1 M", "68.9% hit rate", "up")}
    ${stat("Tool calls", "96,418", "0.52 / request")}
  </div>

  <div class="grid-auto mt-4">
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Cost per day</h2><span class="panel__action muted">USD</span></div>
      <div class="panel__body" style="padding-top:12px">
        ${bars([38,42,51,49,58,61,54,63,68,71,66,74,79,72,81,77,84,88,82,91,86,94,89,97,92,101,88,79,104,98], "--brass")}
        <div class="chart__axis"><span>18 Aug</span><span>01 Sep</span><span>17 Sep</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Model split</h2></div>
      <div class="panel__body">
        <table class="table">
          <thead><tr><th>Model</th><th class="n">Requests</th><th class="n">Cost</th><th class="n">p50</th></tr></thead>
          <tbody>
            <tr><td>claude-sonnet-5</td><td class="n">142,881</td><td class="n">${m(1204.1)}</td><td class="n">1,102 ms</td></tr>
            <tr><td>claude-opus-5</td><td class="n">8,204</td><td class="n">${m(562.8)}</td><td class="n">3,418 ms</td></tr>
            <tr><td>claude-haiku-4-5</td><td class="n">32,937</td><td class="n">${m(75.5)}</td><td class="n">412 ms</td></tr>
          </tbody>
        </table>
        <p class="tiny muted mt-3">Categorisation and merchant matching run on Haiku; assistant conversations on Sonnet; the agent escalates to Opus only for multi-step planning.</p>
      </div>
    </section>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Feature breakdown</h2></div>
    <div class="panel" style="overflow-x:auto">
      <table class="table">
        <thead><tr><th>Feature</th><th class="n">Requests</th><th class="n">Avg in</th><th class="n">Avg out</th><th class="n">p50</th><th class="n">p95</th><th class="n">Errors</th><th class="n">Cost</th></tr></thead>
        <tbody>
          ${[
            ["Transaction categorisation",84210,912,64,"318 ms","890 ms","0.12%",184.2],
            ["Assistant conversation",41882,3418,412,"1,284 ms","4,120 ms","0.68%",982.4],
            ["Receipt extraction",18204,2840,318,"2,104 ms","6,840 ms","1.42%",412.8],
            ["Weekly brief",14209,6120,684,"3,418 ms","8,210 ms","0.31%",184.6],
            ["Anomaly detection",12841,1840,142,"684 ms","1,920 ms","0.08%",48.2],
            ["Recurring detection",8204,2240,196,"820 ms","2,410 ms","0.14%",21.4],
            ["Agent runs",4472,8410,1204,"9,840 ms","28,400 ms","2.10%",8.8],
          ].map(([f, r, ai2, ao, p50, p95, err, cost]) => `
          <tr><td>${f}</td><td class="n">${r.toLocaleString()}</td><td class="n muted">${ai2.toLocaleString()}</td>
            <td class="n muted">${ao}</td><td class="n">${p50}</td><td class="n muted">${p95}</td>
            <td class="n" style="color:var(--${parseFloat(err) > 1 ? "warning" : "ink-tertiary"})">${err}</td>
            <td class="n">${m(cost)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Tool calls</h2><span class="section__meta">96,418 total</span></div>
    <div class="panel"><div class="panel__body">
      ${[["search_transactions",34210],["analyze_spending",14882],["search_budgets",11204],["calculate_summary",9841],["search_accounts",8420],["search_subscriptions",6210],["generate_report",4820],["create_transaction",3418],["update_budget",1842],["create_goal",884],["create_transfer",487],["update_transaction",200]].map(([t, c]) => `
      <div style="padding:7px 0">
        <div class="row tiny"><span class="num">${t}</span>
          ${["create_transaction","update_budget","create_goal","create_transfer","update_transaction"].includes(t) ? '<span class="badge badge--warn" style="margin-left:6px">mutating</span>' : ""}
          <span class="grow"></span><span class="num muted">${c.toLocaleString()}</span></div>
        <div class="mt-2">${meter((c / 34210) * 100, "ok")}</div>
      </div>`).join("")}
      <p class="tiny muted mt-3">Mutating tools are 6.1% of calls. Of 6,831 proposed mutations, 5,204 were confirmed by the user, 1,412 cancelled and 215 blocked by authorisation checks.</p>
    </div></div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════════════ SYSTEM */
const system = {
  id: "admin-system",
  title: "Admin · System",
  note: "Health, error stream, background jobs, database, storage, auth events.",
  body: `${adminBanner}
${appbar("System health", "2 open incidents", `<button class="btn btn--sm btn--secondary">Runbook</button>`)}
${adminNav("admin-system")}
<main class="main">
<div class="container">
  <div class="statgrid mt-4">
    ${stat("API p50", "42 ms", "p95 184 ms")}
    ${stat("Error rate (1h)", "0.08%", "14 of 18,204", "up")}
    ${stat("DB connections", "18 / 60", "pool healthy")}
    ${stat("Storage", "412 GB", "of 1 TB")}
  </div>

  ${callout("danger", "alert", `<b>exchange-rate-sync</b> has failed 2 of its last 3 runs (upstream returned 503). Rates last updated 9 hours ago. Conversions currently fall back to the most recent stored rate and are flagged as stale in the UI.`).replace('class="callout','class="callout mt-4"').replace('mt-4""','mt-4"')}

  <div class="grid-auto mt-4">
    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Background jobs</h2><span class="panel__action muted">Last 24 h</span></div>
      <div class="panel__body" style="padding:0 0 8px">
        <table class="table">
          <thead><tr><th>Job</th><th>Schedule</th><th class="n">Runs</th><th class="n">Failed</th><th>Last run</th></tr></thead>
          <tbody>
            ${[
              ["recurring-materialise","every 15 min",96,0,"2 min ago","ok"],
              ["bill-reminders","hourly",24,0,"14 min ago","ok"],
              ["exchange-rate-sync","every 6 h",4,2,"9 h ago","fail"],
              ["budget-alerts","every 30 min",48,0,"6 min ago","ok"],
              ["anomaly-scan","hourly",24,1,"22 min ago","warn"],
              ["weekly-brief","Mon 06:00",1,0,"2 d ago","ok"],
              ["receipt-ocr-queue","continuous",1842,8,"just now","ok"],
              ["export-builder","on demand",41,0,"1 h ago","ok"],
              ["retention-sweep","daily 03:00",1,0,"14 h ago","ok"],
            ].map(([j, s, r, f, l, st]) => `
            <tr><td class="num">${j}</td><td class="muted">${s}</td><td class="n">${r}</td>
              <td class="n" style="color:var(--${f ? "danger" : "ink-tertiary"})">${f}</td>
              <td><span class="badge ${st === "ok" ? "badge--in" : st === "warn" ? "badge--warn" : "badge--danger"}">${l}</span></td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">Database</h2></div>
      <div class="panel__body">
        <table class="table"><tbody>
          ${[["Size","84.2 GB"],["Largest table","transactions · 41.8 GB"],["Row count","4,182,904"],["Index hit rate","99.82%"],["Slowest query p95","184 ms"],["Replication lag","12 ms"],["Last backup","17 Sep 03:00 UTC"]].map(([k, v]) =>
            `<tr><td>${k}</td><td class="n num">${v}</td></tr>`).join("")}
        </tbody></table>
      </div>
    </section>
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Error stream</h2><span class="section__meta">Grouped · last 24 h</span></div>
    <div class="panel">
      ${[
        ["UpstreamUnavailableError","exchange-rate-sync · GET api.exchangerate.host → 503",2,"9 h ago","--danger"],
        ["ReceiptExtractionTimeout","receipt-ocr-queue · Anthropic request > 30 s",8,"41 min ago","--warning"],
        ["ZodValidationError","POST /api/transactions · amountMinor expected integer",14,"12 min ago","--warning"],
        ["ForbiddenError","GET /api/accounts/:id · ownership check failed",6,"2 h ago","--info"],
        ["RateLimitExceeded","POST /api/ai/chat · 30 req/min per user",41,"6 min ago","--info"],
      ].map(([name, where, count, when, tone]) => `
      <div class="row gap-3" style="padding:12px 16px;border-bottom:1px solid var(--rule-faint)">
        <span style="width:3px;align-self:stretch;background:var(${tone});border-radius:2px;flex:none"></span>
        <div class="col grow" style="min-width:0"><b class="num" style="font-size:var(--text-sm)">${name}</b>
          <span class="tiny muted num">${where}</span></div>
        <span class="num tiny">${count}×</span><span class="tiny muted" style="white-space:nowrap">${when}</span>
      </div>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Authentication events</h2><span class="section__meta">Last hour</span></div>
    <div class="panel">
      ${listRow({ lead: I("check"), title: "412 successful sign-ins", sub: "Google OAuth 384 · password 28", right: "412", tone: "--inflow" })}
      ${listRow({ lead: I("alert"), title: "18 failed password attempts", sub: "Across 11 accounts · 2 hit the lockout threshold", right: "18", tone: "--warning" })}
      ${listRow({ lead: I("shield"), title: "4 sessions revoked", sub: "3 by users, 1 by admin action", right: "4", tone: "--info" })}
      ${listRow({ lead: I("alert"), title: "1 rate-limit block", sub: "IP 203.0.113.44 · 120 sign-in attempts in 60 s", right: "1", tone: "--danger" })}
    </div>
  </section>
</div>
</main>`,
};

export default [overview, users, ai, system];
