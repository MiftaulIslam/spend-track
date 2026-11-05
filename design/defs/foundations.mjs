import { I, m, appbar, meter, bars, spark, donut, stat, empty, callout, listRow, txn } from "../kit.mjs";

/* ═══════════════════════════════════════════════════════════ COMPONENTS  */
const components = {
  id: "components",
  title: "Components",
  note: "Every primitive in one place: type, colour, controls, data display.",
  body: `
${appbar("Component library", "Foundations · v1")}
<main class="main">
<div class="container" style="max-width:940px">

  <section class="section" style="margin-top:20px">
    <div class="section__head"><h2 class="section__title">Typography</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-4">
        <div><div class="eyebrow">Display · mono 46px</div><div class="display display--hero mt-2">${m(48291.4)}</div></div>
        <div><div class="eyebrow">Display · mono 34px</div><div class="display mt-2">${m(4193.76)}</div></div>
        <div><div class="eyebrow">Page title · sans 26px 600</div><h1 style="font-size:var(--text-xl);margin-top:8px">Transactions</h1></div>
        <div><div class="eyebrow">Section title · sans 21px 600</div><h2 class="section__title mt-2">Budget pulse</h2></div>
        <div><div class="eyebrow">List primary · sans 17px 450</div><p style="font-size:var(--text-md);margin-top:8px">Whole Foods Market</p></div>
        <div><div class="eyebrow">Body · sans 15px</div><p class="mt-2" style="max-width:var(--reading-max)">Money direction is the strongest signal in the product, so inflow, outflow and transfer each own a colour and never share one.</p></div>
        <div><div class="eyebrow">Meta · sans 12px tertiary</div><p class="tiny muted mt-2">Groceries · Chase Checking · 09:15</p></div>
        <div><div class="eyebrow">Eyebrow · 11px 600 uppercase +0.06em</div><div class="eyebrow mt-2">Net worth · USD</div></div>
        <div><div class="eyebrow">Serif · marketing only</div><p style="font-family:var(--font-serif);font-size:2rem;margin-top:8px">Know where the money actually went.</p></div>
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Colour</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      ${[
        ["Canvas & surface", [["--paper","paper"],["--surface","surface"],["--surface-sunken","sunken"],["--surface-inverse","inverse"]]],
        ["Ink", [["--ink","ink"],["--ink-secondary","secondary"],["--ink-tertiary","tertiary"],["--ink-disabled","disabled"]]],
        ["Brand", [["--brass","brass"],["--brass-bright","bright"],["--brass-deep","deep"],["--brass-wash","wash"]]],
        ["Money direction", [["--inflow","inflow"],["--outflow","outflow"],["--transfer","transfer"]]],
        ["Status", [["--positive","positive"],["--warning","warning"],["--danger","danger"],["--info","info"]]],
        ["Categories", Array.from({ length: 12 }, (_, i) => [`--cat-${i + 1}`, `cat-${i + 1}`])],
      ].map(([label, swatches]) => `
      <div class="mb-4"><div class="eyebrow mb-2">${label}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px">
          ${swatches.map(([v, n]) => `<div><div style="height:44px;border-radius:var(--radius-sm);background:var(${v});border:1px solid var(--rule)"></div><div class="tiny muted mt-1 num">${n}</div></div>`).join("")}
        </div></div>`).join("")}
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Buttons</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="row gap-2 mb-4" style="flex-wrap:wrap">
        <button class="btn btn--primary">Primary</button>
        <button class="btn btn--secondary">Secondary</button>
        <button class="btn btn--ghost">Ghost</button>
        <button class="btn btn--brass">Brass</button>
        <button class="btn btn--danger">Danger</button>
        <button class="btn btn--primary" disabled>Disabled</button>
      </div>
      <div class="row gap-2 mb-4" style="flex-wrap:wrap;align-items:center">
        <button class="btn btn--primary btn--sm">Small</button>
        <button class="btn btn--primary">Default</button>
        <button class="btn btn--primary btn--lg">Large</button>
        <button class="btn btn--secondary btn--icon">${I("plus","navitem__icon")}</button>
        <button class="btn btn--primary">${I("plus")} With icon</button>
      </div>
      <div class="row gap-2" style="flex-wrap:wrap">
        <button class="chip">Chip</button><button class="chip" aria-pressed="true">Chip selected</button>
        <button class="chip"><span class="chip__dot" style="--cat:var(--cat-1)"></span>Dining out</button>
        <span class="badge">Neutral</span><span class="badge badge--in">Income</span><span class="badge badge--out">Expense</span>
        <span class="badge badge--xfer">Transfer</span><span class="badge badge--warn">Warning</span>
        <span class="badge badge--danger">Danger</span><span class="badge badge--info">Info</span><span class="badge badge--brass">Brass</span>
        <kbd>⌘K</kbd><kbd>⌥</kbd><kbd>↵</kbd>
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Fields</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="grid-2">
        <label class="field"><span class="field__label">Text</span><input class="input" placeholder="Merchant name"></label>
        <label class="field"><span class="field__label">Amount</span><input class="input input--num" value="24.50"></label>
        <label class="field"><span class="field__label">Select</span><select class="input"><option>Chase Checking</option><option>Amex Gold</option></select></label>
        <label class="field"><span class="field__label">Date</span><input class="input input--num" type="date" value="2025-09-17"></label>
        <label class="field" style="grid-column:1/-1"><span class="field__label">Invalid</span>
          <input class="input" aria-invalid="true" value="-12">
          <span class="field__error">${I("alert")} Amount must be greater than zero.</span></label>
        <label class="field" style="grid-column:1/-1"><span class="field__label">Note</span>
          <textarea class="input" placeholder="What was this for?"></textarea>
          <span class="field__hint">Notes are searchable and included in exports.</span></label>
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Data display</h2></div>
    <div class="grid-auto">
      <div class="panel"><div class="panel__head"><h3 class="panel__title">Transaction rows</h3></div>
        ${txn({ name: "Blue Bottle Coffee", meta: ["Coffee shops", "Amex Gold"], amount: 6.75, cat: 1 })}
        ${txn({ name: "Salary · Northwind", meta: ["Salary", "Chase Checking"], amount: 3210, dir: "in", cat: 3 })}
        ${txn({ name: "To Emergency Fund", meta: ["Transfer", "Checking → Savings"], amount: 500, dir: "xfer", cat: 12 })}
        ${txn({ name: "Tokyo Metro", meta: ["Transport", "Wise"], amount: 4.2, cat: 2, fx: "¥620 @ 147.6" })}
        ${txn({ name: "Uber", meta: ["Rideshare", "Amex Gold"], amount: 18.4, cat: 2, pending: true })}
      </div>
      <div class="panel"><div class="panel__head"><h3 class="panel__title">Meters</h3></div>
        <div class="panel__body" style="padding-top:12px">
          <div class="mb-4"><div class="tiny muted mb-2">Under budget · with pace marker</div>${meter(44, "ok", 57)}</div>
          <div class="mb-4"><div class="tiny muted mb-2">Approaching limit</div>${meter(85, "warn", 57)}</div>
          <div class="mb-4"><div class="tiny muted mb-2">Over budget</div>${meter(124, "over", 57)}</div>
          <div class="tiny muted mb-2">Goal progress</div>${meter(64, "ok")}
        </div>
      </div>
      <div class="panel"><div class="panel__head"><h3 class="panel__title">Charts</h3></div>
        <div class="panel__body" style="padding-top:12px">
          ${bars([92,104,88,97,112,81], "--transfer")}
          <div class="chart__axis"><span>Apr</span><span>Sep</span></div>
          <div class="mt-4">${spark([41,43,42,46,48,47,50,52,51,54,56,58], "--inflow", 240, 48)}</div>
          <div class="row mt-4" style="justify-content:center">${donut([[42,"--cat-1"],[26,"--cat-4"],[18,"--cat-3"],[14,"--cat-2"]])}</div>
        </div>
      </div>
      <div class="panel"><div class="panel__head"><h3 class="panel__title">Statgrid</h3></div>
        <div class="panel__body" style="padding-top:12px">
          <div class="statgrid" style="grid-template-columns:repeat(2,1fr)">
            ${stat("In", m(6420, { cls: "num--in" }), "+4.1%", "up")}
            ${stat("Out", m(4193.76), "−7.2%", "up")}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Feedback</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-3">
        ${callout("info", "info", "Historical exchange rates are used for every conversion, not today's rate.")}
        ${callout("warn", "alert", "Spending is 24 points ahead of pace for this point in the month.")}
        ${callout("danger", "alert", "Verizon Fios was due 12 September and is 5 days overdue.")}
        ${callout("brass", "sparkle", "Three subscriptions show no linked activity in 60+ days.")}
        <div class="row gap-2" style="flex-wrap:wrap">
          <div class="toast">${I("check")} Expense saved <button class="toast__action">Undo</button></div>
          <div class="toast">${I("alert")} Couldn't reach the server <button class="toast__action">Retry</button></div>
        </div>
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Command palette</h2><span class="section__meta">⌘K</span></div>
    <div class="panel"><div class="panel__body" style="padding:20px;background:var(--surface-sunken)">
      <div class="cmdk" style="position:static;translate:none;animation:none;width:100%;max-width:520px;margin-inline:auto">
        <div class="cmdk__input">${I("search","navitem__icon")}<input placeholder="Search or run a command…" value="din"></div>
        <div class="cmdk__list">
          <div class="cmdk__group eyebrow">Actions</div>
          <div class="cmdk__item" aria-selected="true">${I("plus")} Add expense to Dining out <kbd>↵</kbd></div>
          <div class="cmdk__item">${I("target")} Open Dining out budget</div>
          <div class="cmdk__group eyebrow">Transactions</div>
          <div class="cmdk__item">${I("store")} Di An Di · $64.20 · 14 Sep</div>
          <div class="cmdk__item">${I("store")} Lilia · $270.00 · 15 Sep</div>
          <div class="cmdk__group eyebrow">Ask the assistant</div>
          <div class="cmdk__item">${I("sparkle")} “How much did I spend on dining this month?”</div>
        </div>
      </div>
    </div></div>
  </section>
</div>
</main>`,
};

/* ═══════════════════════════════════════════════════════════════ STATES  */
const states = {
  id: "states",
  title: "States catalogue",
  note: "Empty, loading, error, offline, permission, success — for every surface.",
  body: `
${appbar("State catalogue", "Every surface ships all six")}
<main class="main">
<div class="container" style="max-width:1000px">

  <section class="section" style="margin-top:20px">
    <div class="section__head"><h2 class="section__title">Empty</h2>
      <span class="section__meta">First run is a teaching moment, not a shrug</span></div>
    <div class="grid-auto">
      <div class="panel">${empty("list", "No transactions yet", "Add your first expense and SpendTrack starts learning your merchants and categories.", '<button class="btn btn--primary btn--sm mt-2">Add expense</button>')}</div>
      <div class="panel">${empty("target", "No budgets set", "Budgets work best when they start from what you actually spend. We can propose limits from your last three months.", '<button class="btn btn--primary btn--sm mt-2">Propose budgets</button>')}</div>
      <div class="panel">${empty("search", "No matches for “kinokuya”", "Check the spelling, or search all transactions instead of this account.", '<button class="btn btn--secondary btn--sm mt-2">Search everywhere</button>')}</div>
      <div class="panel">${empty("filter", "No results with these filters", "Expenses over $500 in Groceries between 1–7 Sep returned nothing.", '<button class="btn btn--secondary btn--sm mt-2">Clear filters</button>')}</div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Loading</h2>
      <span class="section__meta">Skeletons match the real layout's geometry</span></div>
    <div class="grid-auto">
      <div class="panel">
        <div class="panel__head"><h3 class="panel__title">Transaction list</h3></div>
        ${Array.from({ length: 5 }, () => `
        <div class="row gap-3" style="padding:11px 16px;border-bottom:1px solid var(--rule-faint)">
          <div class="skel" style="width:34px;height:34px;border-radius:var(--radius-md);flex:none"></div>
          <div class="col gap-2 grow"><div class="skel skel--text" style="width:52%"></div><div class="skel skel--text" style="width:32%"></div></div>
          <div class="skel skel--text" style="width:62px"></div>
        </div>`).join("")}
      </div>
      <div class="panel">
        <div class="panel__head"><h3 class="panel__title">Dashboard</h3></div>
        <div class="panel__body" style="padding-top:12px">
          <div class="skel skel--text" style="width:34%;height:9px"></div>
          <div class="skel mt-3" style="width:62%;height:38px"></div>
          <div class="skel mt-4" style="height:64px"></div>
          <div class="statgrid mt-4" style="border:0;background:transparent;gap:8px">
            ${Array.from({ length: 4 }, () => '<div class="skel skel--line" style="height:64px"></div>').join("")}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Error</h2>
      <span class="section__meta">Say what happened, what it means, what to do</span></div>
    <div class="grid-auto">
      <div class="panel">${empty("alert", "Couldn't load your transactions", "The server didn't respond in time. Your data is safe — this is a display problem, not a data problem.", '<div class="row gap-2 mt-2"><button class="btn btn--primary btn--sm">Try again</button><button class="btn btn--ghost btn--sm">Work offline</button></div>')}</div>
      <div class="panel">${empty("shield", "You don't have access to this", "This account is private to its owner. Ask them to share it with the household if you need to see it.", '<button class="btn btn--secondary btn--sm mt-2">Back to accounts</button>')}</div>
      <div class="panel">${empty("upload", "That file couldn't be read", "spending.pdf is a scanned image, not a spreadsheet. Export a CSV, XLSX or JSON file from your bank instead.", '<button class="btn btn--secondary btn--sm mt-2">Choose another file</button>')}</div>
      <div class="panel">${empty("sparkle", "The assistant is unavailable", "Claude didn't respond. Everything else works normally — your data and calculations are unaffected.", '<button class="btn btn--secondary btn--sm mt-2">Retry</button>')}</div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Inline &amp; transient</h2></div>
    <div class="panel"><div class="panel__body" style="padding-top:16px">
      <div class="col gap-3">
        <div class="row gap-2" style="flex-wrap:wrap">
          <div class="toast">${I("check")} Expense saved <button class="toast__action">Undo</button></div>
          <div class="toast">${I("history")} Transaction restored <button class="toast__action">View</button></div>
          <div class="toast">${I("alert")} Offline — changes will sync <button class="toast__action">Details</button></div>
        </div>
        <div class="callout callout--warn">${I("alert")}<div><b>Possible duplicate.</b> A $19.99 Spotify charge on the same account and date already exists. <a href="#" style="text-decoration:underline">Compare</a> or <a href="#" style="text-decoration:underline">save anyway</a>.</div></div>
        <div class="callout callout--info">${I("info")}<div><b>Exchange rates are 9 hours stale.</b> Conversions use the last known rate and are marked with a dotted underline until the sync recovers.</div></div>
        <div class="row gap-3" style="padding:12px;border:1px solid var(--rule);border-radius:var(--radius-md)">
          <span class="typing"><i></i><i></i><i></i></span><span class="tiny muted">Assistant is reading 64 transactions…</span>
        </div>
      </div>
    </div></div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">Success &amp; celebration</h2>
      <span class="section__meta">Earned moments only — never for routine saves</span></div>
    <div class="grid-auto">
      <div class="panel">${empty("flag", "Japan fund is fully funded", "You hit $6,000 five weeks early. Contributions are paused until you tell us what's next.", '<div class="row gap-2 mt-2"><button class="btn btn--primary btn--sm">Start a new goal</button><button class="btn btn--ghost btn--sm">Keep saving</button></div>')}</div>
      <div class="panel">${empty("check", "September reconciled", "Chase Checking matches your statement to the cent across 52 transactions.", '<button class="btn btn--secondary btn--sm mt-2">View summary</button>')}</div>
    </div>
  </section>
</div>
</main>`,
};

export default [components, states];
