import { I, m, appbar, meter, bars, spark, stat, empty, callout, listRow, txn } from "../kit.mjs";

const addBtn = (l = "New") => `<button class="btn btn--sm btn--primary">${I("plus")} ${l}</button>`;
const moreBtn = `<button class="btn btn--icon btn--ghost" aria-label="More">${I("more", "navitem__icon")}</button>`;

/* ════════════════════════════════════════════════════════════ CATEGORIES  */
const categories = {
  id: "categories",
  title: "Categories",
  note: "Built-in + custom tree, colours, icons, ordering, archive, merge.",
  body: `
${appbar("Categories", "12 groups · 58 categories", addBtn("Category"))}
<main class="main">
<div class="container">
  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">Expense</button>
    <button class="chip">Income</button>
    <button class="chip">Transfer</button>
    <button class="chip">Archived <span class="badge">4</span></button>
  </div>

  <section class="section">
    <div class="panel">
      ${[
        ["Food & dining", 1, ["Restaurants", "Coffee shops", "Takeaway", "Bars"], 1300.06],
        ["Transport", 2, ["Rideshare", "Public transit", "Fuel", "Parking", "Car maintenance"], 503.25],
        ["Groceries", 3, ["Supermarket", "Farmers market", "Specialty"], 670.99],
        ["Housing", 4, ["Rent", "Home maintenance", "Furnishings"], 922.63],
      ].map(([group, cat, children, total]) => `
      <details${cat === 1 ? " open" : ""} style="border-bottom:1px solid var(--rule-faint)">
        <summary style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;list-style:none">
          <span class="txn__icon" style="--cat:var(--cat-${cat})">${I("tag")}</span>
          <span class="col grow" style="min-width:0">
            <span style="font-size:var(--text-base)">${group}</span>
            <span class="tiny muted">${children.length} subcategories</span></span>
          <span class="num" style="font-size:var(--text-sm)">${m(total)}</span>
        </summary>
        <div style="padding-bottom:6px">
          ${children.map(c => `
          <div class="row gap-3" style="padding:8px 16px 8px 62px;border-top:1px solid var(--rule-faint)">
            <span class="chip__dot" style="--cat:var(--cat-${cat})"></span>
            <span style="font-size:var(--text-sm)">${c}</span><span class="grow"></span>
            <button class="btn btn--sm btn--ghost" style="height:24px">Edit</button>
          </div>`).join("")}
          <div style="padding:8px 16px 8px 62px"><button class="chip">${I("plus")} Add subcategory</button></div>
        </div>
      </details>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Category editor</h2><span class="section__meta">Preview</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-3">
        <label class="field"><span class="field__label">Name</span><input class="input" value="Coffee shops"></label>
        <div class="field"><span class="field__label">Colour</span>
          <div class="row gap-2" style="flex-wrap:wrap">
            ${Array.from({ length: 12 }, (_, i) => `<button aria-label="Colour ${i + 1}" style="width:28px;height:28px;border-radius:var(--radius-sm);background:var(--cat-${i + 1});border:2px solid ${i === 0 ? "var(--ink)" : "transparent"};cursor:pointer"></button>`).join("")}
          </div></div>
        <div class="field"><span class="field__label">Icon</span>
          <div class="row gap-2" style="flex-wrap:wrap">
            ${["store","receipt","wallet","home","sparkle","zap","tag","shield","file","users","calendar","chart"].map((ic, i) =>
              `<button class="btn btn--icon btn--secondary"${i === 0 ? ' style="border-color:var(--ink)"' : ""}>${I(ic,"navitem__icon")}</button>`).join("")}
          </div></div>
        <label class="field"><span class="field__label">Parent</span>
          <select class="input"><option>Food &amp; dining</option><option>None — top level</option></select></label>
        <div class="callout callout--info">${I("info")}<div>Archiving keeps history intact. 214 past transactions stay categorised; the category just stops appearing in pickers.</div></div>
        <div class="row gap-2"><button class="btn btn--primary">Save</button><button class="btn btn--secondary">Merge into…</button><button class="btn btn--ghost">Archive</button></div>
      </div>
    </div></div>
  </section>
</div>
</main>`,
};

/* ═════════════════════════════════════════════════════════════ MERCHANTS  */
const merchants = {
  id: "merchants",
  title: "Merchants",
  note: "Normalised merchant registry with aliases, default category, spend history.",
  body: `
${appbar("Merchants", "218 known · 12 unmatched", addBtn("Merchant"))}
<main class="main">
<div class="container">
  ${callout("warn", "alert", `<b>12 transactions</b> have raw descriptors that don't match a known merchant. <a href="#" style="text-decoration:underline">Review and map</a>`).replace('class="callout', 'class="callout mt-4"').replace('mt-4""','mt-4"')}

  <section class="section">
    <div class="section__head"><h2 class="section__title">Needs mapping</h2></div>
    <div class="panel">
      ${[
        ["SQ *DI AN DI BROOKLYN", "Suggested: Di An Di · Restaurants", 92],
        ["TST* BLUE BOTTLE 0412", "Suggested: Blue Bottle Coffee · Coffee shops", 97],
        ["AMZN MKTP US*2K41Z", "Suggested: Amazon · Shopping", 89],
      ].map(([raw, suggestion, conf]) => `
      <div class="row gap-3" style="padding:12px 16px;border-bottom:1px solid var(--rule-faint)">
        <span class="col grow" style="min-width:0">
          <span class="num" style="font-size:var(--text-sm)">${raw}</span>
          <span class="tiny muted">${suggestion} · ${conf}% confidence</span></span>
        <button class="btn btn--sm btn--primary">Accept</button>
        <button class="btn btn--sm btn--ghost">Change</button>
      </div>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">All merchants</h2><span class="section__meta">Sorted by spend</span></div>
    <div class="panel">
      <table class="table">
        <thead><tr><th>Merchant</th><th>Default category</th><th class="n">Txns</th><th class="n">This year</th><th class="n">Last seen</th></tr></thead>
        <tbody>
          ${[
            ["Whole Foods Market", "Supermarket", 3, 68, 4218.4, "17 Sep"],
            ["Equinox", "Health", 8, 9, 1935.0, "28 Aug"],
            ["Amazon", "Shopping", 7, 41, 1682.33, "14 Sep"],
            ["Uber", "Rideshare", 2, 94, 1104.6, "17 Sep"],
            ["Blue Bottle Coffee", "Coffee shops", 1, 121, 812.75, "17 Sep"],
            ["Con Edison", "Utilities", 6, 12, 1284.0, "15 Sep"],
          ].map(([n2, cat, ci, t, amt, seen]) => `
          <tr><td><span class="row gap-2"><span class="chip__dot" style="--cat:var(--cat-${ci})"></span>${n2}</span></td>
            <td class="muted">${cat}</td><td class="n">${t}</td><td class="n">${m(amt)}</td><td class="n muted">${seen}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════════ RECEIPTS  */
const receipts = {
  id: "receipts",
  title: "Receipts",
  note: "Capture → OCR → AI extraction → review → linked transaction.",
  body: `
${appbar("Receipts", "142 stored · 3 awaiting review", `<button class="btn btn--sm btn--primary">${I("camera")} Capture</button>`)}
<main class="main">
<div class="container">
  <section class="section" style="margin-top:16px">
    <div class="panel" style="border-style:dashed;border-color:var(--rule-strong)">
      <div class="empty" style="padding:32px 24px">
        <div class="empty__art">${I("camera")}</div>
        <div class="empty__title">Drop receipts here</div>
        <p class="empty__body">JPEG, PNG, HEIC or PDF up to 10 MB. Files are scanned for type and stripped of location metadata before storage.</p>
        <div class="row gap-2 mt-2"><button class="btn btn--primary btn--sm">Choose files</button><button class="btn btn--secondary btn--sm">Use camera</button></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Awaiting review</h2><span class="section__meta">3</span></div>
    <div class="panel">
      <div class="row gap-3" style="padding:16px;border-bottom:1px solid var(--rule-faint);align-items:flex-start">
        <div style="width:78px;height:104px;border-radius:var(--radius-sm);background:var(--surface-sunken);border:1px solid var(--rule);flex:none;display:grid;place-items:center;color:var(--ink-tertiary)">${I("receipt")}</div>
        <div class="col gap-2 grow" style="min-width:0">
          <div class="row gap-2"><b style="font-size:var(--text-sm)">Di An Di</b><span class="badge badge--in">${I("check")} 94% confident</span></div>
          <dl class="col gap-1 tiny" style="margin:0">
            <div class="row gap-3"><dt class="muted" style="width:70px">Total</dt><dd class="num" style="margin:0">${m(64.2)}</dd></div>
            <div class="row gap-3"><dt class="muted" style="width:70px">Tax</dt><dd class="num" style="margin:0">${m(5.7)}</dd></div>
            <div class="row gap-3"><dt class="muted" style="width:70px">Tip</dt><dd class="num" style="margin:0">${m(12.0)}</dd></div>
            <div class="row gap-3"><dt class="muted" style="width:70px">Date</dt><dd class="num" style="margin:0">14 Sep 2025 20:12</dd></div>
            <div class="row gap-3"><dt class="muted" style="width:70px">Items</dt><dd style="margin:0">6 line items extracted</dd></div>
          </dl>
          <div class="callout callout--warn tiny mt-2">${I("alert")}<div>No matching charge found on any account. Create a new transaction, or link it manually.</div></div>
          <div class="row gap-2 mt-2"><button class="btn btn--sm btn--primary">Create transaction</button><button class="btn btn--sm btn--secondary">Link to existing</button><button class="btn btn--sm btn--ghost">Discard</button></div>
        </div>
      </div>
      ${listRow({ lead: I("receipt"), title: "Whole Foods Market", sub: "Matched to charge on 15 Sep · 99% confidence", right: m(84.32), rightSub: "auto-linked", tone: "--inflow" })}
      ${listRow({ lead: I("receipt"), title: "Unreadable scan", sub: "OCR confidence 31% · needs manual entry", right: "—", rightSub: "failed", tone: "--danger" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Library</h2><span class="section__meta">142 receipts · 318 MB</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px">
        ${Array.from({ length: 14 }, (_, i) => `<div style="aspect-ratio:3/4;border-radius:var(--radius-sm);background:var(--surface-sunken);border:1px solid var(--rule);display:grid;place-items:center;color:var(--ink-disabled)">${I("receipt")}</div>`).join("")}
      </div>
    </div></div>
  </section>
</div>
</main>`,
};

/* ════════════════════════════════════════════════════════════════ IMPORT  */
const importScreen = {
  id: "import",
  title: "Import",
  note: "Upload → column mapping → validation → duplicate detection → commit.",
  body: `
${appbar("Import", "Step 3 of 4 · Review", `<button class="btn btn--sm btn--ghost">Cancel</button>`)}
<main class="main">
<div class="container" style="max-width:940px">
  <ol class="row gap-2 mt-4 tiny" style="flex-wrap:wrap">
    ${[["Upload","done"],["Map columns","done"],["Review","active"],["Commit",""]].map(([s, st], i) => `
      <li class="row gap-2">
        <span style="width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-family:var(--font-mono);
          background:${st === "done" ? "var(--inflow)" : st === "active" ? "var(--ink)" : "var(--surface-sunken)"};
          color:${st ? "var(--ink-inverse)" : "var(--ink-tertiary)"}">${st === "done" ? "✓" : i + 1}</span>
        <span style="color:${st ? "var(--ink)" : "var(--ink-tertiary)"}">${s}</span>
        ${i < 3 ? '<span style="width:18px;height:1px;background:var(--rule-strong)"></span>' : ""}
      </li>`).join("")}
  </ol>

  <div class="statgrid mt-4">
    ${stat("Rows found", "248", "chase-aug-2025.csv")}
    ${stat("Will import", "231", "93%", "up")}
    ${stat("Duplicates", "14", "skipped", "down")}
    ${stat("Errors", "3", "need fixing", "down")}
  </div>

  ${callout("warn", "alert", `<b>3 rows can't be imported.</b> Two have unparseable dates and one has an amount of 0. Fix them inline or import the other 231 rows and handle these separately.`).replace('class="callout','class="callout mt-4"').replace('mt-4""','mt-4"')}

  <section class="section">
    <div class="section__head"><h2 class="section__title">Column mapping</h2><button class="section__meta" style="background:none;border:0;cursor:pointer;text-decoration:underline">Change</button></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="grid-2">
        ${[["Transaction Date","Date","--inflow"],["Description","Merchant + note","--inflow"],["Amount","Amount (negative = expense)","--inflow"],["Category","Category (fuzzy match)","--warning"],["Type","Ignored","--ink-tertiary"],["Memo","Note","--inflow"]].map(([src, dst, tone]) => `
        <div class="row gap-2 tiny" style="padding:8px 0;border-bottom:1px solid var(--rule-faint)">
          <span class="num muted" style="width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${src}</span>
          <span style="color:var(--ink-disabled)">→</span>
          <span style="color:var(${tone})">${dst}</span></div>`).join("")}
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Preview</h2><span class="section__meta">First 6 of 248 rows</span></div>
    <div class="panel" style="overflow-x:auto">
      <table class="table">
        <thead><tr><th style="width:28px"></th><th>Date</th><th>Merchant</th><th>Category</th><th class="n">Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${[
            ["01/08/2025","WHOLEFDS BKN 10259","Groceries",-92.14,"ok",""],
            ["01/08/2025","SPOTIFY USA","Entertainment",-19.99,"dup","Matches existing txn #8821"],
            ["02/08/2025","NORTHWIND LABS PAYROLL","Salary",3210.00,"ok",""],
            ["02/08/2025","UBER *TRIP","Rideshare",-14.20,"ok",""],
            ["03/08/2025","—","",0,"err","Amount is zero"],
            ["03/08/2025","TST* LILIA","Restaurants",-124.00,"new","New merchant — will be created"],
          ].map(([d, mch, cat, amt, st, note]) => `
          <tr>
            <td><input type="checkbox" ${st === "ok" || st === "new" ? "checked" : ""} ${st === "err" ? "disabled" : ""}></td>
            <td class="num muted">${d}</td><td>${mch}</td><td class="muted">${cat}</td>
            <td class="n" style="color:var(--${amt > 0 ? "inflow" : "ink"})">${amt === 0 ? "—" : m(Math.abs(amt), { sign: amt > 0 ? "+" : "−" })}</td>
            <td>${{
              ok: '<span class="badge badge--in">Import</span>',
              dup: '<span class="badge badge--warn">Duplicate</span>',
              err: '<span class="badge badge--danger">Error</span>',
              new: '<span class="badge badge--info">New merchant</span>',
            }[st]}${note ? `<div class="tiny muted">${note}</div>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <div class="row gap-2 mt-6"><button class="btn btn--primary">Import 231 transactions</button><button class="btn btn--secondary">Back to mapping</button></div>
  <p class="tiny muted mt-3">The import runs in one database transaction. If any row fails at commit time, nothing is written and you keep the mapping.</p>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════ RECONCILIATION   */
const reconciliation = {
  id: "reconciliation",
  title: "Reconcile",
  note: "Compare real balance to recorded balance, tick off, post adjustment.",
  body: `
${appbar("Reconcile", "Chase Checking · ···8821", `<button class="btn btn--sm btn--ghost">History</button>`)}
<main class="main">
<div class="container" style="max-width:860px">
  <div class="statgrid mt-4">
    ${stat("Recorded balance", m(8240.12), "as of today")}
    ${stat("Actual balance", m(8198.37), "you entered")}
    ${stat("Difference", "−" + m(41.75).replace(/^<span class="num ">/, ""), "unexplained", "down")}
    ${stat("Last reconciled", "02 Sep", "15 days ago")}
  </div>

  ${callout("info", "info", `Tick every transaction that appears on your statement. The difference updates live. When it reaches zero, the reconciliation closes; if you stop early, SpendTrack offers to post a balancing adjustment.`).replace('class="callout','class="callout mt-4"').replace('mt-4""','mt-4"')}

  <section class="section">
    <div class="section__head"><h2 class="section__title">Unreconciled since 02 Sep</h2><span class="section__meta">18 transactions</span></div>
    <div class="panel">
      ${[
        ["Whole Foods Market", "15 Sep", 84.32, true],
        ["Con Edison", "15 Sep", 112.00, true],
        ["Trader Joe's", "15 Sep", 61.18, true],
        ["Amex Gold payment", "15 Sep", 1240.00, true],
        ["Transfer to Ally Savings", "16 Sep", 500.00, true],
        ["ATM withdrawal", "12 Sep", 41.75, false],
        ["Northwind Labs payroll", "30 Aug", 3210.00, true],
      ].map(([n2, d, amt, checked]) => `
      <label class="row gap-3" style="padding:11px 16px;border-bottom:1px solid var(--rule-faint);cursor:pointer">
        <input type="checkbox" ${checked ? "checked" : ""}>
        <span class="col grow" style="min-width:0"><span style="font-size:var(--text-sm)">${n2}</span>
          <span class="tiny muted">${d}${!checked ? " · not on statement" : ""}</span></span>
        <span class="num" style="font-size:var(--text-sm)">${m(amt)}</span>
      </label>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="panel" style="border-color:var(--brass-rule)">
      <div class="panel__head"><h2 class="panel__title">Resolve the difference</h2></div>
      <div class="panel__body">
        <p class="tiny secondary">A ${m(41.75).replace(/<[^>]+>/g, "")} ATM withdrawal on 12 Sep is recorded but not on your statement. Choose how to close this out:</p>
        <div class="col gap-2 mt-3">
          <label class="row gap-3" style="padding:10px;border:1px solid var(--rule);border-radius:var(--radius-md);cursor:pointer">
            <input type="radio" name="resolve" checked>
            <span class="col"><b style="font-size:var(--text-sm)">Post a balancing adjustment</b>
              <span class="tiny muted">Creates an adjustment transaction of −${m(41.75).replace(/<[^>]+>/g, "")} categorised as “Reconciliation adjustment”.</span></span>
          </label>
          <label class="row gap-3" style="padding:10px;border:1px solid var(--rule);border-radius:var(--radius-md);cursor:pointer">
            <input type="radio" name="resolve">
            <span class="col"><b style="font-size:var(--text-sm)">Delete the ATM withdrawal</b>
              <span class="tiny muted">Removes it entirely. The deletion is recorded in the activity log with the original values.</span></span>
          </label>
          <label class="row gap-3" style="padding:10px;border:1px solid var(--rule);border-radius:var(--radius-md);cursor:pointer">
            <input type="radio" name="resolve">
            <span class="col"><b style="font-size:var(--text-sm)">Leave it — close anyway</b>
              <span class="tiny muted">Marks the reconciliation as closed with a known variance.</span></span>
          </label>
        </div>
        <div class="row gap-2 mt-4"><button class="btn btn--primary">Finish reconciliation</button><button class="btn btn--ghost">Save and continue later</button></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Past reconciliations</h2></div>
    <div class="panel">
      ${listRow({ lead: I("check"), title: "02 Sep 2025", sub: "Balanced exactly · 34 transactions", right: m(0), rightSub: "no variance", tone: "--inflow" })}
      ${listRow({ lead: I("check"), title: "01 Aug 2025", sub: "Adjustment posted · 41 transactions", right: m(12.4), rightSub: "variance", tone: "--warning" })}
      ${listRow({ lead: I("check"), title: "03 Jul 2025", sub: "Balanced exactly · 38 transactions", right: m(0), rightSub: "no variance", tone: "--inflow" })}
    </div>
  </section>
</div>
</main>`,
};

/* ═════════════════════════════════════════════════════════════════ RULES  */
const rules = {
  id: "rules",
  title: "Rules",
  note: "If/then automation over incoming transactions, with dry-run counts.",
  body: `
${appbar("Rules", "9 active · 1,842 applications", addBtn("Rule"))}
<main class="main">
<div class="container">
  <section class="section" style="margin-top:16px">
    <div class="panel">
      ${[
        ["Restaurant MCC → Dining out", "When merchant category code is 5812", "Set category to Dining out", 412, true],
        ["Whole Foods → Groceries", "When merchant contains “WHOLEFDS”", "Set merchant Whole Foods Market, category Groceries", 68, true],
        ["Large charges need review", "When amount > $500 and type is expense", "Flag for review, send notification", 14, true],
        ["Payroll → Salary", "When description contains “PAYROLL”", "Set category Salary, mark as income", 21, true],
        ["Card payments aren't expenses", "When transfer between Checking and any credit card", "Classify as credit card payment", 36, true],
        ["Business meals", "When category is Dining out and tag “client”", "Add tag deductible", 9, false],
      ].map(([name, when, then, count, on]) => `
      <div class="row gap-3" style="padding:14px 16px;border-bottom:1px solid var(--rule-faint);align-items:flex-start">
        <span class="txn__icon" style="--cat:var(${on ? "--brass" : "--ink-tertiary"})">${I("zap")}</span>
        <div class="col gap-1 grow" style="min-width:0">
          <b style="font-size:var(--text-sm)">${name}</b>
          <span class="tiny muted"><b style="color:var(--ink-secondary)">If</b> ${when}</span>
          <span class="tiny muted"><b style="color:var(--ink-secondary)">Then</b> ${then}</span>
          <span class="tiny muted mt-1">Applied ${count} times</span>
        </div>
        <span class="badge ${on ? "badge--in" : ""}">${on ? "Active" : "Paused"}</span>
      </div>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Rule builder</h2><span class="section__meta">Preview</span></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-4">
        <div class="col gap-2">
          <div class="eyebrow">When all of these are true</div>
          <div class="row gap-2" style="flex-wrap:wrap">
            <select class="input" style="width:auto"><option>Merchant</option><option>Amount</option><option>Category</option><option>Account</option><option>Description</option><option>Day of week</option></select>
            <select class="input" style="width:auto"><option>contains</option><option>equals</option><option>starts with</option><option>matches regex</option></select>
            <input class="input" style="width:auto;flex:1;min-width:140px" value="WHOLEFDS">
            <button class="btn btn--icon btn--ghost" aria-label="Remove">${I("close","navitem__icon")}</button>
          </div>
          <div class="row gap-2" style="flex-wrap:wrap">
            <select class="input" style="width:auto"><option>Amount</option></select>
            <select class="input" style="width:auto"><option>is greater than</option></select>
            <input class="input input--num" style="width:auto;flex:1;min-width:120px" value="20.00">
            <button class="btn btn--icon btn--ghost" aria-label="Remove">${I("close","navitem__icon")}</button>
          </div>
          <button class="chip" style="align-self:flex-start">${I("plus")} Add condition</button>
        </div>
        <div class="col gap-2">
          <div class="eyebrow">Then do this</div>
          <div class="row gap-2" style="flex-wrap:wrap">
            <select class="input" style="width:auto"><option>Set category</option><option>Set merchant</option><option>Add tag</option><option>Flag for review</option><option>Notify me</option><option>Skip from budgets</option></select>
            <select class="input" style="width:auto;flex:1;min-width:140px"><option>Groceries</option></select>
          </div>
          <button class="chip" style="align-self:flex-start">${I("plus")} Add action</button>
        </div>
        <div class="callout callout--brass">${I("sparkle")}<div><b>Dry run:</b> this rule would match <b>68 existing transactions</b> and change the category on 51 of them. <a href="#" style="text-decoration:underline">See which</a></div></div>
        <div class="row gap-2"><button class="btn btn--primary">Save rule</button><button class="btn btn--secondary">Save and apply to history</button></div>
      </div>
    </div></div>
  </section>
</div>
</main>`,
};

/* ═════════════════════════════════════════════════════════ NOTIFICATIONS  */
const notifications = {
  id: "notifications",
  title: "Notifications",
  note: "Inbox plus per-channel preference matrix with quiet hours.",
  body: `
${appbar("Notifications", "4 unread", `<button class="btn btn--sm btn--ghost">Mark all read</button>`)}
<main class="main">
<div class="container" style="max-width:860px">
  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">All</button><button class="chip">Unread <span class="badge">4</span></button>
    <button class="chip">Bills</button><button class="chip">Budgets</button><button class="chip">Security</button>
  </div>

  <section class="section">
    <div class="panel">
      ${[
        ["alert","--danger","Verizon Fios is overdue","Due 12 Sep · $89.99 · 5 days late","2h ago",true],
        ["target","--warning","Dining out is over budget","$348.15 spent of $280.00 · 24% over","Today 09:12",true],
        ["sparkle","--brass","Your weekly brief is ready","Spending down 7% · 3 unused subscriptions found","Today 06:02",true],
        ["alert","--warning","Unusual charge detected","$412.00 at Best Buy — 4.8× your typical spend there","Yesterday 18:44",true],
        ["check","--inflow","Salary received","$3,210.00 into Chase Checking","30 Aug 09:00",false],
        ["shield","--info","New sign-in","Chrome on Windows · New York, US","28 Aug 21:03",false],
        ["flag","--inflow","Goal milestone reached","Japan fund passed $3,500","24 Aug 12:00",false],
      ].map(([ic, tone, title, body, when, unread]) => `
      <div class="row gap-3" style="padding:13px 16px;border-bottom:1px solid var(--rule-faint);${unread ? "background:var(--brass-wash)" : ""}">
        <span class="txn__icon" style="--cat:var(${tone})">${I(ic)}</span>
        <div class="col grow" style="min-width:0">
          <b style="font-size:var(--text-sm);font-weight:${unread ? 600 : 450}">${title}</b>
          <span class="tiny muted">${body}</span>
        </div>
        <span class="tiny muted" style="white-space:nowrap">${when}</span>
      </div>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Preferences</h2></div>
    <div class="panel" style="overflow-x:auto">
      <table class="table">
        <thead><tr><th>Event</th><th style="text-align:center">In-app</th><th style="text-align:center">Push</th><th style="text-align:center">Email</th></tr></thead>
        <tbody>
          ${[
            ["Bill due soon", 1, 1, 1],["Bill overdue", 1, 1, 1],["Budget 80% reached", 1, 1, 0],
            ["Budget exceeded", 1, 1, 1],["Unusual transaction", 1, 1, 0],["Subscription renewing", 1, 1, 0],
            ["Trial ending", 1, 1, 1],["Low balance", 1, 1, 0],["Goal milestone", 1, 0, 0],
            ["Recurring created", 1, 0, 0],["Monthly summary", 1, 0, 1],["New sign-in", 1, 1, 1],
          ].map(([ev, a, b, c]) => `
          <tr><td>${ev}</td>
            ${[a,b,c].map(v => `<td style="text-align:center"><input type="checkbox" ${v ? "checked" : ""}></td>`).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="panel__foot row gap-3">
        <span class="tiny secondary">Quiet hours</span>
        <input class="input input--num btn--sm" style="width:92px;height:32px" value="22:00">
        <span class="tiny muted">to</span>
        <input class="input input--num btn--sm" style="width:92px;height:32px" value="07:30">
        <span class="tiny muted">Overdue bills and security alerts ignore quiet hours.</span>
      </div>
    </div>
  </section>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════ HOUSEHOLD */
const household = {
  id: "household",
  title: "Household",
  note: "Shared finance space with owner/admin/member/viewer permissions.",
  body: `
${appbar("Household", "Bergen St · 3 members", `<button class="btn btn--sm btn--primary">${I("plus")} Invite</button>`)}
<main class="main">
<div class="container" style="max-width:900px">
  <div class="statgrid mt-4">
    ${stat("Shared accounts", "4", "of 9 total")}
    ${stat("Shared budgets", "6", "of 9")}
    ${stat("Combined spend", m(6841.2), "September")}
    ${stat("Pending invites", "1", "expires in 5 days")}
  </div>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Members</h2></div>
    <div class="panel">
      ${[
        ["Miftaul Islam","webmakers3bd@gmail.com","Owner","--brass","Full access including billing and deletion"],
        ["Ayesha Rahman","ayesha@example.com","Admin","--transfer","Can manage accounts, budgets and members"],
        ["Zaid Islam","zaid@example.com","Member","--inflow","Can add and edit their own transactions"],
      ].map(([n2, email, role, tone, desc]) => `
      <div class="row gap-3" style="padding:14px 16px;border-bottom:1px solid var(--rule-faint)">
        <span class="txn__icon" style="--cat:var(${tone});width:34px;height:34px">${n2.split(" ").map(w => w[0]).join("")}</span>
        <div class="col grow" style="min-width:0">
          <b style="font-size:var(--text-sm)">${n2}</b>
          <span class="tiny muted">${email} · ${desc}</span>
        </div>
        <span class="badge">${role}</span>
        <button class="btn btn--icon btn--ghost" aria-label="Manage">${I("more","navitem__icon")}</button>
      </div>`).join("")}
      <div class="row gap-3" style="padding:14px 16px;opacity:.7">
        <span class="txn__icon" style="--cat:var(--ink-tertiary);width:34px;height:34px">${I("bell")}</span>
        <div class="col grow"><b style="font-size:var(--text-sm)">nadia@example.com</b>
          <span class="tiny muted">Invited 14 Sep as Viewer · expires 22 Sep</span></div>
        <button class="btn btn--sm btn--ghost">Resend</button><button class="btn btn--sm btn--ghost">Revoke</button>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Permission matrix</h2></div>
    <div class="panel" style="overflow-x:auto">
      <table class="table">
        <thead><tr><th>Capability</th><th style="text-align:center">Owner</th><th style="text-align:center">Admin</th><th style="text-align:center">Member</th><th style="text-align:center">Viewer</th></tr></thead>
        <tbody>
          ${[
            ["View shared accounts & transactions",1,1,1,1],
            ["Create own transactions",1,1,1,0],
            ["Edit any transaction",1,1,0,0],
            ["Manage shared accounts",1,1,0,0],
            ["Manage budgets & goals",1,1,0,0],
            ["Import & export data",1,1,0,0],
            ["Invite or remove members",1,1,0,0],
            ["Change member roles",1,0,0,0],
            ["Delete the household",1,0,0,0],
            ["Use the AI assistant",1,1,1,1],
            ["Run AI mutations",1,1,0,0],
          ].map(([cap, ...vals]) => `
          <tr><td>${cap}</td>${vals.map(v => `<td style="text-align:center;color:var(--${v ? "inflow" : "ink-disabled"})">${v ? "●" : "—"}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Shared with the household</h2></div>
    <div class="panel">
      ${listRow({ lead: I("wallet"), title: "Chase Checking", sub: "All members can view · admins can edit", right: "Shared", tone: "--inflow" })}
      ${listRow({ lead: I("home"), title: "Rent budget", sub: "All members can view", right: "Shared", tone: "--inflow" })}
      ${listRow({ lead: I("receipt"), title: "Amex Gold", sub: "Private to you", right: "Private", tone: "--ink-tertiary" })}
      ${listRow({ lead: I("chart"), title: "Fidelity Brokerage", sub: "Private to you", right: "Private", tone: "--ink-tertiary" })}
    </div>
  </section>
</div>
</main>`,
};

/* ══════════════════════════════════════════════════════════════════ AUDIT */
const audit = {
  id: "audit",
  title: "Activity log",
  note: "Immutable record of every financial change with before/after values.",
  body: `
${appbar("Activity log", "Last 30 days · 412 events", `<button class="btn btn--sm btn--secondary">${I("filter")} Filter</button><button class="btn btn--sm btn--ghost">${I("upload")} Export</button>`)}
<main class="main">
<div class="container" style="max-width:940px">
  <div class="chiprow" style="padding-inline:0">
    <button class="chip" aria-pressed="true">All</button><button class="chip">Transactions</button>
    <button class="chip">Accounts</button><button class="chip">Budgets</button>
    <button class="chip">AI actions</button><button class="chip">Security</button>
  </div>

  <section class="section">
    <div class="panel">
      ${[
        ["17 Sep 09:16","You","Updated transaction","Blue Bottle Coffee","category: Coffee shops → Dining out","--transfer"],
        ["17 Sep 08:31","Assistant (confirmed by you)","Updated budget","Dining out · monthly","limitMinor: 28000 → 34000","--brass"],
        ["16 Sep 22:10","You","Split transaction","Lilia · $270.00","1 split → 3 splits","--transfer"],
        ["16 Sep 19:02","System · rule","Categorised transaction","TST* LILIA","category: null → Dining out","--ink-tertiary"],
        ["16 Sep 09:00","Ayesha Rahman","Created transaction","Whole Foods Market","amountMinor: 8432, account: Chase Checking","--inflow"],
        ["15 Sep 14:22","You","Deleted transaction","Duplicate Uber charge","amountMinor: 1840, restored within 30 days","--danger"],
        ["15 Sep 09:41","System · import","Imported transactions","chase-aug-2025.csv","231 created, 14 duplicates skipped","--ink-tertiary"],
        ["14 Sep 20:15","You","Signed in","Chrome on Windows","ip: 74.12.•••.•••, New York US","--info"],
      ].map(([when, who, action, target, detail, tone]) => `
      <div class="row gap-3" style="padding:12px 16px;border-bottom:1px solid var(--rule-faint);align-items:flex-start">
        <span class="num tiny muted" style="width:96px;flex:none;padding-top:2px">${when}</span>
        <span style="width:3px;align-self:stretch;background:var(${tone});border-radius:2px;flex:none"></span>
        <div class="col grow" style="min-width:0">
          <span style="font-size:var(--text-sm)"><b>${who}</b> · ${action}</span>
          <span class="tiny muted">${target}</span>
          <span class="tiny num muted" style="margin-top:2px">${detail}</span>
        </div>
      </div>`).join("")}
    </div>
  </section>

  <div class="callout callout--info mt-4">${I("shield")}<div>Activity records are append-only and cannot be edited or deleted from the app. Financial records keep their full before/after payload for 7 years; security events for 2 years.</div></div>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════ SETTINGS */
const settings = {
  id: "settings",
  title: "Settings",
  note: "Profile, preferences, currency, security sessions, data, danger zone.",
  body: `
${appbar("Settings", "Miftaul Islam")}
<main class="main">
<div class="container" style="max-width:820px">
  <section class="section" style="margin-top:16px">
    <div class="panel">
      <div class="row gap-3" style="padding:18px 16px;border-bottom:1px solid var(--rule-faint)">
        <span class="txn__icon" style="--cat:var(--brass);width:48px;height:48px;font-size:16px">MI</span>
        <div class="col grow"><b>Miftaul Islam</b><span class="tiny muted">webmakers3bd@gmail.com · Google account</span>
          <span class="tiny muted">Member since March 2024</span></div>
        <button class="btn btn--sm btn--secondary">Edit</button>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Preferences</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-3">
        <div class="grid-2">
          <label class="field"><span class="field__label">Base currency</span>
            <select class="input"><option>USD — US Dollar</option><option>EUR — Euro</option><option>GBP — Pound Sterling</option><option>BDT — Bangladeshi Taka</option></select>
            <span class="field__hint">All totals and reports convert to this currency.</span></label>
          <label class="field"><span class="field__label">Locale</span>
            <select class="input"><option>English (United States)</option><option>English (United Kingdom)</option></select></label>
        </div>
        <div class="grid-2">
          <label class="field"><span class="field__label">First day of week</span>
            <select class="input"><option>Monday</option><option>Sunday</option></select></label>
          <label class="field"><span class="field__label">Month starts on</span>
            <input class="input input--num" value="1"><span class="field__hint">Set to your payday for pay-cycle budgeting.</span></label>
        </div>
        <div class="grid-2">
          <label class="field"><span class="field__label">Number format</span>
            <select class="input"><option>1,234.56</option><option>1.234,56</option><option>1 234,56</option></select></label>
          <label class="field"><span class="field__label">Theme</span>
            <div class="row gap-2"><button class="chip" aria-pressed="true">System</button><button class="chip">Light</button><button class="chip">Dark</button></div></label>
        </div>
        <label class="row gap-3" style="padding:10px 0;border-top:1px solid var(--rule-faint)">
          <input type="checkbox" checked><span class="col"><b class="tiny">Hide balances by default</b>
            <span class="tiny muted">Amounts are masked until you tap to reveal. Useful in public.</span></span></label>
        <label class="row gap-3" style="padding:10px 0;border-top:1px solid var(--rule-faint)">
          <input type="checkbox" checked><span class="col"><b class="tiny">Reduce motion</b>
            <span class="tiny muted">Follows your system setting. Overriding here applies to this device only.</span></span></label>
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Exchange rates</h2></div>
    <div class="panel">
      ${listRow({ lead: I("db"), title: "Automatic daily rates", sub: "Last fetched today 04:00 UTC · 168 currencies", right: "On", tone: "--inflow" })}
      ${listRow({ lead: I("scale"), title: "EUR → USD", sub: "Historical rate on the transaction date is always used", right: "1.0821", tone: "--ink-secondary" })}
      ${listRow({ lead: I("scale"), title: "JPY → USD", sub: "Historical rate on the transaction date is always used", right: "0.00677", tone: "--ink-secondary" })}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Security</h2></div>
    <div class="panel">
      ${listRow({ lead: I("shield"), title: "Google — webmakers3bd@gmail.com", sub: "Primary sign-in method · connected Mar 2024", right: "Connected", tone: "--inflow" })}
      ${listRow({ lead: I("shield"), title: "Password", sub: "Set 4 Sep 2025 · used as a fallback", right: "Change", tone: "--ink-secondary" })}
    </div>
    <div class="panel mt-3">
      <div class="panel__head"><h3 class="panel__title">Active sessions</h3><button class="panel__action" style="background:none;border:0;cursor:pointer;color:var(--danger)">Sign out everywhere</button></div>
      ${[
        ["Chrome · Windows 11","New York, US · 74.12.•••.•••","Current session",true],
        ["Safari · iPhone 15","New York, US · 74.12.•••.•••","Active 2 hours ago",false],
        ["Firefox · macOS","Dhaka, BD · 103.84.•••.•••","Last used 12 Sep",false],
      ].map(([dev, loc, when, current]) => `
      <div class="row gap-3" style="padding:12px 16px;border-top:1px solid var(--rule-faint)">
        <span class="txn__icon" style="--cat:var(${current ? "--inflow" : "--ink-tertiary"})">${I("shield")}</span>
        <div class="col grow" style="min-width:0"><b style="font-size:var(--text-sm)">${dev}</b>
          <span class="tiny muted">${loc} · ${when}</span></div>
        ${current ? '<span class="badge badge--in">This device</span>' : '<button class="btn btn--sm btn--ghost" style="color:var(--danger)">Revoke</button>'}
      </div>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">AI &amp; data</h2></div>
    <div class="panel">
      ${listRow({ lead: I("sparkle"), title: "AI assistant", sub: "Claude can read your financial data to answer questions", right: "On", tone: "--inflow" })}
      ${listRow({ lead: I("zap"), title: "Automatic AI categorisation", sub: "New transactions are categorised on import", right: "On", tone: "--inflow" })}
      ${listRow({ lead: I("shield"), title: "AI mutations without confirmation", sub: "Off — every change the assistant proposes asks you first", right: "Off", tone: "--ink-tertiary" })}
      ${listRow({ lead: I("upload"), title: "Export everything", sub: "JSON or CSV archive of all your data", right: "Request", tone: "--ink-secondary" })}
    </div>
    <div class="panel mt-3" style="border-color:color-mix(in oklab, var(--danger) 30%, transparent)">
      <div class="panel__head"><h3 class="panel__title" style="color:var(--danger)">Danger zone</h3></div>
      <div class="panel__body">
        <p class="tiny secondary">Deleting your account removes every transaction, account, receipt and conversation. Export first — this cannot be undone, and we keep nothing after 30 days.</p>
        <button class="btn btn--sm btn--danger mt-3">Delete account</button>
      </div>
    </div>
  </section>
</div>
</main>`,
};

export default [categories, merchants, receipts, importScreen, reconciliation, rules, notifications, household, audit, settings];
