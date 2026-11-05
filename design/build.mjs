/* ============================================================================
   Generates design/screens/*.html from the screen definitions in ./screens.mjs
   Run: node design/build.mjs
   ========================================================================== */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCREENS } from "./screens.mjs";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "screens"), { recursive: true });

const page = ({ id, title, body, chrome = true, script = "" }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} · SpendTrack design</title>
<link rel="stylesheet" href="../app.css">
</head>
<body>
${chrome ? '<div class="shell"><div class="content">' : ""}
${body}
${chrome ? "</div></div>" : ""}
<script src="../shell.js"></script>
<script>mountShell(${JSON.stringify(id)}, { chrome: ${chrome} });${script}</script>
</body>
</html>
`;

let n = 0;
for (const s of SCREENS) {
  writeFileSync(join(here, "screens", `${s.id}.html`), page(s), "utf8");
  n++;
}

/* ---- index ------------------------------------------------------------- */
const groups = [
  ["Entry & marketing", ["landing", "signin", "onboarding"]],
  ["Daily money", ["dashboard", "transactions", "transaction-detail", "quick-add", "accounts", "account-detail", "calendar"]],
  ["Planning", ["budgets", "goals", "bills", "subscriptions", "recurring", "debts", "lending"]],
  ["Understanding", ["analytics", "reports", "assistant"]],
  ["Data & operations", ["categories", "merchants", "receipts", "import", "reconciliation", "rules", "notifications", "household", "audit", "settings"]],
  ["Super admin", ["admin-overview", "admin-users", "admin-ai", "admin-system"]],
  ["Foundations", ["components", "states"]],
];
const byId = Object.fromEntries(SCREENS.map(s => [s.id, s]));

const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SpendTrack — Design</title>
<link rel="stylesheet" href="app.css">
<style>
  .idx { max-width: 1100px; margin-inline: auto; padding: 0 24px 96px; }
  .idx-hero { padding: 88px 0 56px; border-bottom: 1px solid var(--rule); }
  .idx-hero h1 { font-family: var(--font-serif); font-size: clamp(2.6rem, 7vw, 4.2rem); font-weight: 400; letter-spacing: -0.03em; line-height: 1; }
  .idx-hero p { max-width: 58ch; color: var(--ink-secondary); font-size: var(--text-md); margin-top: 20px; line-height: 1.6; }
  .idx-group { padding-top: 40px; }
  .idx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: var(--radius-lg); overflow: clip; margin-top: 14px; }
  .idx-card { background: var(--surface); padding: 16px; display: flex; flex-direction: column; gap: 4px; transition: background var(--dur-fast) var(--ease-out); }
  .idx-card:hover { background: var(--surface-sunken); }
  .idx-card b { font-size: var(--text-sm); font-weight: 550; }
  .idx-card span { font-size: var(--text-xs); color: var(--ink-tertiary); line-height: 1.45; }
  .sw { display:flex; gap:1px; border:1px solid var(--rule); border-radius: var(--radius-md); overflow:clip; margin-top:14px; }
  .sw i { flex:1; height:56px; }
</style>
</head>
<body>
<div class="proto-bar"><b>SpendTrack</b> · design prototype <span class="grow"></span>
  <button class="btn btn--sm btn--ghost" style="color:inherit;height:24px" onclick="toggleTheme()">Toggle theme</button></div>
<div class="idx">
  <header class="idx-hero">
    <div class="eyebrow">Design system &amp; screen library</div>
    <h1>Ledger&nbsp;Instrument</h1>
    <p>SpendTrack's visual world: warm paper instead of white, hairline rules instead of card soup,
       monospace tabular numerals carrying every quantity, and brass used as a scarce signal — never
       as decoration. Built mobile-first, verified at 390&nbsp;px and 1440&nbsp;px.</p>
    <div class="sw" aria-hidden="true">
      <i style="background:var(--paper)"></i><i style="background:var(--surface-sunken)"></i>
      <i style="background:var(--ink)"></i><i style="background:var(--brass)"></i>
      <i style="background:var(--inflow)"></i><i style="background:var(--outflow)"></i>
      <i style="background:var(--transfer)"></i><i style="background:var(--warning)"></i>
      <i style="background:var(--danger)"></i><i style="background:var(--info)"></i>
    </div>
    <div class="row gap-3 mt-6" style="flex-wrap:wrap">
      <a class="btn btn--primary" href="screens/dashboard.html">Open the app</a>
      <a class="btn btn--secondary" href="screens/components.html">Component library</a>
      <a class="btn btn--secondary" href="screens/states.html">State catalogue</a>
      <a class="btn btn--ghost" href="../docs/design-system.md">Written spec</a>
    </div>
  </header>
  ${groups.map(([label, ids]) => `
  <section class="idx-group">
    <div class="eyebrow">${label}</div>
    <div class="idx-grid">
      ${ids.map(id => `<a class="idx-card" href="screens/${id}.html">
        <b>${byId[id] ? byId[id].title : id}</b><span>${byId[id]?.note || ""}</span></a>`).join("")}
    </div>
  </section>`).join("")}
</div>
<script src="shell.js"></script>
</body>
</html>
`;
writeFileSync(join(here, "index.html"), indexHtml, "utf8");
console.log(`✓ generated ${n} screens + index`);
