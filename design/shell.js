/* ============================================================================
   SpendTrack design prototype — shared chrome.
   Injects the prototype bar, desktop rail and mobile tab bar into every screen
   so each screen file only contains the design that is actually unique to it.
   ========================================================================== */

const NAV = [
  {
    label: "Money",
    items: [
      ["dashboard", "Overview", "home"],
      ["transactions", "Transactions", "list"],
      ["accounts", "Accounts", "wallet"],
      ["calendar", "Calendar", "calendar"],
    ],
  },
  {
    label: "Plan",
    items: [
      ["budgets", "Budgets", "target", "3 over"],
      ["goals", "Goals", "flag"],
      ["bills", "Bills", "receipt", "2 due"],
      ["subscriptions", "Subscriptions", "repeat"],
      ["recurring", "Recurring", "rotate"],
      ["debts", "Debt", "trending-down"],
      ["lending", "Lending", "handshake"],
    ],
  },
  {
    label: "Understand",
    items: [
      ["analytics", "Analytics", "chart"],
      ["reports", "Reports", "file"],
      ["assistant", "Assistant", "sparkle"],
    ],
  },
  {
    label: "Manage",
    items: [
      ["categories", "Categories", "tag"],
      ["merchants", "Merchants", "store"],
      ["receipts", "Receipts", "camera"],
      ["import", "Import", "upload"],
      ["reconciliation", "Reconcile", "scale"],
      ["rules", "Rules", "zap"],
      ["household", "Household", "users"],
      ["notifications", "Notifications", "bell", "4"],
      ["audit", "Activity log", "history"],
      ["settings", "Settings", "settings"],
    ],
  },
];

const TABS = [
  ["dashboard", "Home", "home"],
  ["transactions", "Activity", "list"],
  ["__add", "Add", "plus"],
  ["budgets", "Budgets", "target"],
  ["more", "More", "menu"],
];

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5"/><path d="M16 13h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  flag: '<path d="M4 21V4h9l1 2h6v9h-7l-1-2H4"/>',
  receipt: '<path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z"/><path d="M9 8h6M9 12h6"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  "trending-down": '<path d="M3 7l7 7 4-4 7 7"/><path d="M21 17v-5h-5"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 1 0-2.8l.6-.6"/><path d="M8 7 5.4 9.6a2 2 0 0 0 0 2.8l3.4 3.4"/><path d="M3 12 9 6l3 3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 9v9M17 5v13"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  tag: '<path d="M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8z"/><circle cx="8" cy="8" r="1.4"/>',
  store: '<path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M3 9l1.5-5h15L21 9"/><path d="M9 21v-6h6v6"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  scale: '<path d="M12 3v18M6 21h12"/><path d="m3 9 3-5 3 5a3 3 0 0 1-6 0Z"/><path d="m15 9 3-5 3 5a3 3 0 0 1-6 0Z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 20a6.4 6.4 0 0 0-2-4.6"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4.5l3 1.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.6 4.4a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.1 1.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  "arrow-up": '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  "arrow-down": '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="m18 9-6 6M12 9l6 6"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
};

function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
}
window.icon = icon;

const SCREENS = [
  ["dashboard", "Overview"], ["transactions", "Transactions"], ["transaction-detail", "Transaction detail"],
  ["quick-add", "Quick add"], ["accounts", "Accounts"], ["account-detail", "Account detail"],
  ["budgets", "Budgets"], ["goals", "Goals"], ["debts", "Debt"], ["lending", "Lending"],
  ["subscriptions", "Subscriptions"], ["bills", "Bills"], ["recurring", "Recurring"], ["calendar", "Calendar"],
  ["categories", "Categories"], ["merchants", "Merchants"], ["receipts", "Receipts"], ["import", "Import"],
  ["reconciliation", "Reconcile"], ["rules", "Rules"], ["notifications", "Notifications"],
  ["analytics", "Analytics"], ["reports", "Reports"], ["assistant", "AI assistant"],
  ["household", "Household"], ["audit", "Activity log"], ["settings", "Settings"],
  ["admin-overview", "Admin · Overview"], ["admin-users", "Admin · Users"],
  ["admin-ai", "Admin · AI"], ["admin-system", "Admin · System"],
  ["signin", "Sign in"], ["onboarding", "Onboarding"], ["landing", "Landing"],
  ["states", "States catalogue"], ["components", "Components"],
];

function protoBar(current) {
  const opts = SCREENS.map(([id, label]) =>
    `<option value="${id}.html"${id === current ? " selected" : ""}>${label}</option>`
  ).join("");
  return `<div class="proto-bar">
    <a href="../index.html">&larr; Design index</a>
    <select onchange="location.href=this.value" aria-label="Jump to screen">${opts}</select>
    <span class="grow"></span>
    <button class="btn btn--sm btn--ghost" style="color:inherit;height:24px" onclick="toggleTheme()">Theme</button>
  </div>`;
}

function rail(current) {
  const groups = NAV.map(g => `
    <div class="navgroup">
      <div class="navgroup__label eyebrow">${g.label}</div>
      ${g.items.map(([id, label, ic, badge]) => `
        <a class="navitem" href="${id}.html"${id === current ? ' aria-current="page"' : ""}>
          ${icon(ic, "navitem__icon")}<span>${label}</span>
          ${badge ? `<span class="navitem__badge">${badge}</span>` : ""}
        </a>`).join("")}
    </div>`).join("");

  return `<nav class="rail" aria-label="Primary">
    <a class="brandmark" href="dashboard.html">
      <span class="brandmark__glyph">S</span><span class="brandmark__word">SpendTrack</span>
    </a>
    <button class="btn btn--secondary btn--sm" style="justify-content:flex-start;width:100%;margin-bottom:16px;color:var(--ink-tertiary)" onclick="document.body.classList.toggle('cmdk-open')">
      ${icon("search", "navitem__icon")} Search or jump… <kbd style="margin-left:auto">⌘K</kbd>
    </button>
    ${groups}
    <div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--rule)">
      <a class="navitem" href="settings.html">
        <span class="txn__icon" style="width:22px;height:22px;font-size:10px;--cat:var(--brass)">MI</span>
        <span style="min-width:0"><span style="display:block;font-size:var(--text-sm);color:var(--ink)">Miftaul Islam</span>
        <span style="display:block;font-size:var(--text-2xs);color:var(--ink-tertiary)">Household · Owner</span></span>
      </a>
    </div>
  </nav>`;
}

function tabbar(current) {
  return `<nav class="tabbar hide-desktop" aria-label="Primary">
    ${TABS.map(([id, label, ic]) =>
      id === "__add"
        ? `<button class="tabbar__item" onclick="location.href='quick-add.html'" aria-label="Add transaction">
             <span class="tabbar__fab">${icon("plus", "tabbar__icon")}</span></button>`
        : `<a class="tabbar__item" href="${id}.html"${id === current ? ' aria-current="page"' : ""}>
             ${icon(ic, "tabbar__icon")}<span>${label}</span></a>`
    ).join("")}
  </nav>`;
}

window.toggleTheme = function () {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("st-theme", next); } catch {}
};

(function initTheme() {
  try {
    const saved = localStorage.getItem("st-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch {}
})();

window.mountShell = function (current, { chrome = true } = {}) {
  document.body.insertAdjacentHTML("afterbegin", protoBar(current));
  if (!chrome) return;
  const shell = document.querySelector(".shell");
  if (shell) shell.insertAdjacentHTML("afterbegin", rail(current));
  document.body.insertAdjacentHTML("beforeend", tabbar(current));
};

/* Stagger helper: sets --i on children so list entry cascades. */
window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".stagger").forEach(list => {
    [...list.children].forEach((el, i) => el.style.setProperty("--i", i));
  });
  document.querySelectorAll(".chart__bars").forEach(list => {
    [...list.children].forEach((el, i) => el.style.setProperty("--i", i));
  });
});
