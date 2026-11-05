/* ============================================================================
   Screen definitions for the SpendTrack design prototype.
   Content is deliberately realistic — real merchant names, real amounts,
   real edge cases (a pending charge, an over-budget category, a cross-currency
   transfer, an unreconciled account). Placeholder-looking data hides design
   problems; specific data exposes them.
   ========================================================================== */

import { ICONS } from "./icons.mjs";

/* ------------------------------------------------------------- primitives */
export const I = (n, c = "") =>
  `<svg class="${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.info}</svg>`;

/** Money, always monospace + tabular, fraction de-emphasised. */
export const m = (amount, { cur = "$", cls = "", sign = "" } = {}) => {
  const [whole, frac = "00"] = String(Math.abs(amount).toFixed(2)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `<span class="num ${cls}">${sign}<span class="num__cur">${cur}</span>${grouped}<span class="num__frac">.${frac}</span></span>`;
};

export const appbar = (title, sub, right = "", back = false) => `
<header class="appbar">
  ${back ? `<button class="btn btn--icon btn--ghost hide-desktop" aria-label="Back">${I("back", "navitem__icon")}</button>` : ""}
  <div class="col">
    <span class="appbar__title">${title}</span>
    ${sub ? `<span class="appbar__sub">${sub}</span>` : ""}
  </div>
  <span class="appbar__spacer"></span>
  ${right}
</header>`;

const searchBtn = `<button class="btn btn--icon btn--ghost" aria-label="Search">${I("search", "navitem__icon")}</button>`;
const filterBtn = `<button class="btn btn--icon btn--ghost" aria-label="Filter">${I("filter", "navitem__icon")}</button>`;
const moreBtn = `<button class="btn btn--icon btn--ghost" aria-label="More actions">${I("more", "navitem__icon")}</button>`;

/** One transaction row. dir: out | in | xfer */
export const txn = ({ name, meta, amount, dir = "out", cat = 1, glyph = "", pending = false, cur = "$", fx = "" }) => `
<a class="txn" href="transaction-detail.html"${pending ? ' data-pending="true"' : ""}>
  <span class="txn__icon" style="--cat:var(--cat-${cat})">${glyph || I(catIcon(cat))}</span>
  <span class="txn__body">
    <span class="txn__name">${name}</span>
    <span class="txn__meta">${meta.map(x => `<span>${x}</span>`).join("")}</span>
  </span>
  ${meta[0] ? `<span class="txn__col hide-mobile">${meta[0]}</span><span class="txn__col hide-mobile">${meta[1] || ""}</span>` : ""}
  <span class="txn__amount ${dir === "in" ? "txn__amount--in" : dir === "xfer" ? "txn__amount--xfer" : ""}">
    ${m(amount, { cur, sign: dir === "in" ? "+" : dir === "xfer" ? "" : "−" })}
    ${fx ? `<small>${fx}</small>` : ""}
  </span>
</a>`;

const catIcon = c => ["store", "receipt", "store", "home", "sparkle", "zap", "tag", "shield", "file", "users", "calendar", "wallet"][(c - 1) % 12];

export const dayGroup = (date, total, rows) => `
<section class="txn-day">
  <div class="txn-day__head"><span class="txn-day__date">${date}</span><span class="txn-day__total">${total}</span></div>
  ${rows}
</section>`;

export const meter = (pct, tone = "ok", mark = null) => `
<div class="meter meter--${tone}">
  <div class="meter__fill" style="width:${Math.min(pct, 100)}%"></div>
  ${mark != null ? `<div class="meter__mark" style="left:${mark}%"></div>` : ""}
</div>`;

export const bars = (values, colorVar = "--ink") => {
  const max = Math.max(...values);
  return `<div class="chart__bars">${values
    .map(v => `<div class="chart__bar" style="height:${Math.max((v / max) * 100, 2)}%;--bar:var(${colorVar})"></div>`)
    .join("")}</div>`;
};

export const spark = (points, stroke = "--ink", w = 240, h = 56) => {
  const max = Math.max(...points), min = Math.min(...points);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * w},${h - ((p - min) / (max - min || 1)) * (h - 6) - 3}`)
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(${stroke})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
};

export const donut = (segments) => {
  const C = 2 * Math.PI * 42;
  let offset = 0;
  return `<svg class="donut" viewBox="0 0 100 100" style="width:132px;height:132px" aria-hidden="true">
    ${segments.map(([pct, color], idx) => {
      const len = (pct / 100) * C;
      const el = `<circle cx="50" cy="50" r="42" fill="none" stroke="var(${color})" stroke-width="11"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" style="animation-delay:${idx * 60}ms"/>`;
      offset += len;
      return el;
    }).join("")}
  </svg>`;
};

export const empty = (ic, title, body, cta = "") => `
<div class="empty">
  <div class="empty__art">${I(ic)}</div>
  <div class="empty__title">${title}</div>
  <p class="empty__body">${body}</p>
  ${cta}
</div>`;

export const callout = (tone, ic, html) => `<div class="callout callout--${tone}">${I(ic)}<div>${html}</div></div>`;

export const stat = (label, value, delta = "", tone = "") =>
  `<div class="stat"><span class="stat__label">${label}</span><span class="stat__value">${value}</span>${
    delta ? `<span class="stat__delta ${tone ? `stat__delta--${tone}` : ""}">${delta}</span>` : ""
  }</div>`;

export const listRow = ({ lead, title, sub, right, rightSub, href = "#", tone = "" }) => `
<a class="txn" href="${href}">
  <span class="txn__icon" style="--cat:var(${tone || "--ink-secondary"})">${lead}</span>
  <span class="txn__body"><span class="txn__name">${title}</span><span class="txn__meta"><span>${sub}</span></span></span>
  <span class="txn__amount">${right}${rightSub ? `<small>${rightSub}</small>` : ""}</span>
</a>`;

