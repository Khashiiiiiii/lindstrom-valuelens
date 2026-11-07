// PROTOTYPE, throw me away. Variant D: the left bar is the menu, the AI is a round button bottom right that opens
// a modal. Adds dark mode, a collapsible menu, SVG charts, a profile menu and an EN, SV and FI switch.
// Uses the shared state S and helpers from index.html, which load after this file but before any call.

const D_ICON = {
  overview: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
  sites: '<path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>',
  opportunities: '<path d="M3 17l6-6 4 4 8-8v6h2V3h-10v2h6l-6 6-4-4-8 8z"/>',
  priorities: '<path d="M3 5h12v2H3zm0 6h8v2H3zm0 6h4v2H3zm14-6l4 4-4 4v-3h-4v-2h4z"/>',
  data: '<path d="M12 3C7 3 3 4.8 3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7c0-2.2-4-4-9-4zm0 2c4 0 7 1.3 7 2s-3 2-7 2-7-1.3-7-2 3-2 7-2z"/>',
  review: '<path d="M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8 12h8v2H8zm0 4h8v2H8z"/>',
  ai: '<path d="M12 2l1.8 4.7L18.5 8.5l-4.7 1.8L12 15l-1.8-4.7L5.5 8.5l4.7-1.8zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9zM6 15l.7 1.6 1.6.7-1.6.7L6 19.6l-.7-1.6-1.6-.7 1.6-.7z"/>',
  menu: '<path d="M3 6h18v2H3zm0 5h12v2H3zm0 5h18v2H3z"/>',
  moon: '<path d="M20 15.3A8.5 8.5 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3z"/>',
  sun: '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z"/>',
  chevron: '<path d="M7 10l5 5 5-5z"/>',
  up: '<path d="M12 5l6 7h-4v7h-4v-7H6z"/>',
  down: '<path d="M12 19l-6-7h4V5h4v7h4z"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="currentColor">${D_ICON[k]}</svg>`;
// Fictional user for the profile menu.
const D_USER = { name: "Aino Virtanen", email: "aino.virtanen@example.com" };
const portrait = (size = 36) => `<svg class="D-portrait" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
  <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--c2)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>
  <circle cx="20" cy="20" r="20" fill="url(#pg)"/><path d="M6 37c2-8 7-11 14-11s12 3 14 11a20 20 0 0 1-28 0z" fill="#fff" opacity=".92"/>
  <circle cx="20" cy="16" r="7.5" fill="#f3c9a6"/><path d="M12.3 15.5c0-5.5 3.5-8.5 7.7-8.5s7.8 3 7.8 8.5c-1.8-2.6-4.3-3.6-7.8-3.6s-6 1-7.7 3.6z" fill="#5b3b28"/></svg>`;

const D_URL = new URL(location.href);
const D = {
  section: D_URL.searchParams.get("section") || "overview", lastSection: null, sites: null, sitesKey: "",
  transparency: [], transparencyFor: null, open: D_URL.searchParams.get("ai") === "open", tab: "ask",
  unread: false, wasBusy: false, refocus: false,
  charts: null, chartsKey: "", anim: false, trendKpi: "washed_kg", siteKpi: null, menu: false,
};
// Which way is better, for the colour of the change badge. 0 is neutral.
const D_GOOD = { on_time_service_cycle_share: 1, service_requests_per_100_wearers: -1, water_saved: 1, emissions_saved: 1, energy_saved: 1, scan_coverage: 1, late_service_cycles: -1, turnaround_hours_median: -1, repair_rate: 1, recycled_or_reused_share: 1, allocated_garments_with_no_scan_activity: -1 };

function dNav(section) {
  D.section = section; D.menu = false; url.searchParams.set("section", section); history.replaceState(null, "", url); render(); window.scrollTo(0, 0);
}

// ---- Number helpers for charts ----
function dNum(v, unit, compact = true) {
  if (v === null || v === undefined) return "";
  const loc = D_LOCALE();
  if (unit === "share") return `${(v * 100).toLocaleString(loc, { maximumFractionDigits: 1 })}${UI.lang === "en" ? "%" : " %"}`;
  return v.toLocaleString(loc, compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
}
const dMonth = (i) => new Date(2025, i, 1).toLocaleString(D_LOCALE(), { month: "short" }).replace(".", "");
function dPeriodRange() {
  if (S.period === "2025") return [0, 11];
  if (S.period === "2025-H1") return [0, 5];
  if (S.period === "2025-H2") return [6, 11];
  const i = S.meta.months.indexOf(S.period); return [i, i];
}
function dDelta(kpi_id) {
  const d = D.charts?.series[kpi_id]?.delta; if (!d) return "";
  const good = D_GOOD[kpi_id] ?? 0, dir = d.change >= 0 ? 1 : -1;
  const cls = good === 0 || Math.abs(d.change) < 0.0005 ? "flat" : good * dir > 0 ? "good" : "bad";
  const pct = Math.abs(d.change * 100).toLocaleString(D_LOCALE(), { maximumFractionDigits: 1 });
  return `<span class="D-delta ${cls}" title="${esc(d.label)}">${icon(dir > 0 ? "up" : "down")}${pct}%</span><span class="muted"> ${esc(d.label)}</span>`;
}

// ---- SVG charts. No library. Animations run only when D.anim is set, so a plain re-render stays still. ----
function chSpark(values) {
  const v = values.filter((x) => x !== null); if (v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = values.map((x, i) => [i * (100 / (values.length - 1)), 28 - ((x - min) / span) * 24]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return `<svg class="D-spark" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="${line}L100 30L0 30Z" class="area"/><path d="${line}" class="line D-draw" pathLength="1"/></svg>`;
}

function chArea(series) {
  const W = 640, H = 230, L = 52, B = 26, T = 12, R = 24;
  const vals = series.values, n = vals.length, [a, b] = dPeriodRange();
  const v = vals.filter((x) => x !== null);
  let min = Math.min(...v), max = Math.max(...v);
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.05 || 1;
  min = series.unit === "share" ? Math.max(0, min - pad) : Math.max(0, min - pad * 2); max += pad;
  const x = (i) => L + (i * (W - L - R)) / (n - 1), y = (val) => T + (1 - (val - min) / (max - min)) * (H - T - B);
  const pts = vals.map((val, i) => [x(i), y(val)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  const grid = [0, 1, 2, 3].map((k) => { const val = min + ((max - min) * k) / 3; return `<line x1="${L}" x2="${W - R}" y1="${y(val)}" y2="${y(val)}" class="grid"/><text x="${L - 8}" y="${y(val) + 4}" text-anchor="end">${dNum(val, series.unit)}</text>`; }).join("");
  const band = a === 0 && b === n - 1 ? "" : `<rect x="${x(a) - (a === b ? 14 : 6)}" y="${T}" width="${x(b) - x(a) + (a === b ? 28 : 12)}" height="${H - T - B}" rx="8" class="band"/>`;
  return `<svg class="D-chart" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c1)" stop-opacity=".28"/><stop offset="1" stop-color="var(--c1)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${band}
    <path d="${line}L${x(n - 1)} ${H - B}L${L} ${H - B}Z" fill="url(#ag)" class="D-fadein"/>
    <path d="${line}" class="line D-draw" pathLength="1"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i >= a && i <= b ? 4 : 3}" class="pt ${i >= a && i <= b ? "on" : ""}" data-tip="${esc(dMonth(i))} 2025: ${esc(dNum(vals[i], series.unit, false))} ${esc(series.unit === "share" ? "" : tr(series.unit))}"/>`).join("")}
    ${vals.map((_, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="${i >= a && i <= b ? "hi" : ""}">${esc(dMonth(i))}</text>`).join("")}
  </svg>`;
}

function chRadial(r, thresholds) {
  if (!r || r.withheld || r.value === null) return "";
  const v = r.value, arc = "M 20 110 A 90 90 0 0 1 200 110";
  const tick = (t, cls) => { const ang = Math.PI * (1 - t); const cx = 110 + 90 * Math.cos(ang), cy = 110 - 90 * Math.sin(ang); const ix = 110 + 72 * Math.cos(ang), iy = 110 - 72 * Math.sin(ang); return `<line x1="${ix}" y1="${iy}" x2="${cx + (cx - 110) * 0.12}" y2="${cy + (cy - 110) * 0.12}" class="tick ${cls}"/>`; };
  const color = !thresholds ? "var(--c1)" : v >= thresholds.green_threshold ? "var(--good)" : v >= thresholds.amber_threshold ? "var(--amber)" : "var(--bad)";
  return `<svg class="D-radial" viewBox="0 0 220 130">
      <path d="${arc}" class="track" pathLength="100"/>
      <path d="${arc}" class="val D-sweep" pathLength="100" stroke="${color}" stroke-dasharray="${(v * 100).toFixed(2)} 100"/>
      ${thresholds ? tick(thresholds.amber_threshold, "amber") + tick(thresholds.green_threshold, "green") : ""}
      <text x="110" y="100" text-anchor="middle" class="big">${dNum(v, "share")}</text></svg>
    <div class="muted" style="text-align:center">${tr("of sampled service cycles on time")}</div>
    ${thresholds ? `<div class="muted" style="text-align:center;margin-top:4px">${tr("Green from {g}, amber from {a}", { g: dNum(thresholds.green_threshold, "share"), a: dNum(thresholds.amber_threshold, "share") })}</div>` : ""}`;
}

function chDonut(r) {
  if (!r || r.withheld || !r.breakdown) return "";
  const total = r.breakdown.reduce((n, p) => n + p.value, 0);
  const colors = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];
  let off = 0;
  const segs = r.breakdown.map((p, i) => {
    const pct = (p.value / total) * 100, s = `<circle cx="80" cy="80" r="58" pathLength="100" stroke="${colors[i]}" stroke-dasharray="${Math.max(pct - 0.6, 0.1).toFixed(2)} 100" stroke-dashoffset="${-off}" class="dseg D-sweep" data-tip="${esc(tr(p.key))}: ${dNum(p.value, "kg", false)} kg, ${dNum(p.value / total, "share")}"/>`;
    off += pct; return s;
  }).join("");
  return `<div class="D-donutwrap"><svg class="D-donut" viewBox="0 0 160 160"><g transform="rotate(-90 80 80)">${segs}</g>
      <text x="80" y="78" text-anchor="middle" class="big">${dNum(total, "kg")}</text><text x="80" y="96" text-anchor="middle">kg ${tr("total")}</text></svg>
    <div class="D-legend">${r.breakdown.map((p, i) => `<div><i style="background:${colors[i]}"></i><span>${esc(tr(p.key))}</span><b>${dNum(p.value / total, "share")}</b></div>`).join("")}</div></div>`;
}

function chStacked(stages) {
  if (!stages || stages.withheld) return "";
  const W = 640, H = 220, L = 34, B = 26, T = 10, R = 6;
  const keys = stages[0].map((s) => s.key), colors = ["var(--c1)", "var(--c2)", "var(--c3)"];
  const totals = stages.map((m) => m.reduce((n, s) => n + s.value, 0)), max = Math.ceil(Math.max(...totals) / 20) * 20;
  const bw = ((W - L - R) / stages.length) * 0.56, step = (W - L - R) / stages.length;
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const [a, b] = dPeriodRange();
  const bars = stages.map((m, i) => {
    let acc = 0; const x = L + i * step + (step - bw) / 2;
    return `<g class="D-grow ${i >= a && i <= b ? "" : "dim"}" style="animation-delay:${i * 25}ms">${m.map((s, k) => { const y1 = y(acc + s.value), h = y(acc) - y1; acc += s.value; return `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(h - 1, 0)}" rx="${k === m.length - 1 ? 4 : 0}" fill="${colors[k]}" data-tip="${esc(dMonth(i))}: ${esc(tr(s.key))} ${s.value} h"/>`; }).join("")}</g>`;
  }).join("");
  const grid = [0, 0.5, 1].map((k) => `<line x1="${L}" x2="${W - R}" y1="${y(max * k)}" y2="${y(max * k)}" class="grid"/><text x="${L - 6}" y="${y(max * k) + 4}" text-anchor="end">${max * k}</text>`).join("");
  return `<svg class="D-chart" viewBox="0 0 ${W} ${H}">${grid}${bars}${stages.map((_, i) => `<text x="${L + i * step + step / 2}" y="${H - 6}" text-anchor="middle">${esc(dMonth(i))}</text>`).join("")}</svg>
    <div class="D-legend row">${keys.map((k, i) => `<div><i style="background:${colors[i]}"></i><span>${esc(tr(k))}</span></div>`).join("")}</div>`;
}

function chHBars(rows, unit) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return `<div class="D-hbars">${rows.map((r, i) => `<div class="D-hbar ${r.on ? "on" : ""}" onclick="${r.onclick}" data-tip="${esc(r.label)}: ${esc(dNum(r.value, unit, false))}">
      <span class="lbl">${esc(r.label)}</span><span class="track"><span class="fill D-growx" style="width:${(r.value / max) * 100}%;animation-delay:${i * 15}ms"></span></span><span class="v">${dNum(r.value, unit)}</span></div>`).join("")}</div>`;
}

// Fetches monthly series, the waste route split and the stage turnaround for the current selection.
function dCharts() {
  const kpis = [...new Set(S.screen.blocks.flatMap((b) => b.results.filter((r) => !r.withheld).map((r) => r.kpi_id)))];
  const key = JSON.stringify([S.customer_id, S.site_id, S.period, S.view, kpis]);
  if (D.chartsKey !== key) {
    D.chartsKey = key;
    post("/api/charts", { customer_id: S.customer_id, site_id: S.site_id ?? undefined, period: S.period, view: S.view, kpi_ids: kpis })
      .then((r) => { if (D.chartsKey !== key) return; D.charts = r.json; D.anim = true; render(); });
  }
  return D.charts;
}

// ---- Layout ----
function dApplyUI() {
  const b = document.body.classList;
  b.toggle("D-dark", UI.theme === "dark"); b.toggle("D-lind", UI.palette === "lindstrom"); b.toggle("D-collapsed", !!UI.collapsed);
  document.documentElement.lang = UI.lang;
}

function dSeg(options, current, onclick) {
  return `<span class="seg">${options.map(([k, l]) => `<button class="${current === k ? "on" : ""}" onclick="${onclick(k)}">${l}</button>`).join("")}</span>`;
}

function dProfile() {
  return `<div class="D-prof"><button class="D-avatar" onclick="D.menu=!D.menu;render()" aria-expanded="${D.menu}">${portrait(34)}<span class="who"><b>${D_USER.name}</b><span class="muted">KAM</span></span>${icon("chevron")}</button>
    ${D.menu ? `<div class="D-menu">
      <div class="D-menuhead">${portrait(44)}<div><b>${D_USER.name}</b><div class="muted">${tr("Key Account Manager")}</div><div class="muted">${D_USER.email}</div></div></div>
      <div class="D-menurow"><span>${tr("Language")}</span>${dSeg([["en", "English"], ["sv", "Svenska"], ["fi", "Suomi"]], UI.lang, (k) => `saveUI({lang:'${k}'})`)}</div>
      <div class="D-menurow"><span>${tr("Theme")}</span>${dSeg([["light", tr("Light")], ["dark", tr("Dark")]], UI.theme, (k) => `saveUI({theme:'${k}'})`)}</div>
      <div class="D-menurow"><span>${tr("Colours")}</span>${dSeg([["indigo", tr("Indigo")], ["lindstrom", tr("Lindström-style")]], UI.palette, (k) => `saveUI({palette:'${k}'})`)}</div>
      <button class="D-signout" disabled>${tr("Sign out")}</button></div>` : ""}</div>`;
}

function VariantD() {
  dApplyUI();
  const s = S.screen;
  const fired = s.signal_groups.reduce((n, g) => n + g.fired_count, 0);
  const items = [["overview", "Overview"], ["sites", "Sites"], ["opportunities", "Opportunities", fired], ["priorities", "Priorities"], ["data", "Data and assumptions"]];
  const sectionChanged = D.section !== D.lastSection; D.lastSection = D.section;
  const anim = sectionChanged || D.anim; D.anim = false;
  const titles = { overview: "Overview", sites: "Sites", opportunities: "Opportunities", priorities: "Customer priorities", data: "Data and assumptions" };
  const c = dCharts();
  return `<div class="D-wrap"><nav class="D-nav">
      <div class="D-logo"><i></i><span class="lbl">ValueLens</span></div>
      <div class="D-cust">${customerSelect()}</div>
      <div class="D-navlabel"><span class="lbl">${tr("Dashboard")}</span></div>
      ${items.map(([k, l, n]) => `<a class="D-item ${D.section === k ? "on" : ""}" title="${esc(tr(l))}" onclick="dNav('${k}')">${icon(k)}<span class="lbl">${tr(l)}</span>${n ? `<span class="count">${n}</span>` : ""}</a>`).join("")}
      <div class="D-navlabel"><span class="lbl">${tr("Export")}</span></div>
      <a class="D-item" title="${esc(tr("Print review"))}" onclick="openReview()">${icon("review")}<span class="lbl">${tr("Print review")}</span></a>
      <div class="D-navfoot lbl">${esc(s.customer.industry)}, ${esc(s.customer.segment)}<br>${tr("Synthetic data, 2025")}</div>
    </nav>
    <div class="D-right">
      <header class="D-top">
        <button class="D-iconbtn" title="${tr(UI.collapsed ? "Expand menu" : "Collapse menu")}" onclick="saveUI({collapsed:!UI.collapsed})">${icon("menu")}</button>
        <span class="D-crumb"><b>${esc(s.customer.customer_name)}</b>${S.site_id ? ` / ${esc(siteName(S.site_id))}` : ""}</span>
        <span class="D-grow"></span>
        ${dSeg([["en", "EN"], ["sv", "SV"], ["fi", "FI"]], UI.lang, (k) => `saveUI({lang:'${k}'})`)}
        <button class="D-iconbtn" title="${tr(UI.theme === "dark" ? "Light" : "Dark")}" onclick="saveUI({theme:UI.theme==='dark'?'light':'dark'})">${icon(UI.theme === "dark" ? "sun" : "moon")}</button>
        ${dProfile()}
      </header>
      <main class="D-main"><div class="D-head">
          <div><h1>${tr(titles[D.section])}</h1><div class="sub">${S.period}, ${tr(S.view + " view")}</div></div>
          ${siteFilter()}<span class="D-grow"></span>${periodSelect()}${viewToggle()}
        </div>
        ${UI.lang !== "en" ? `<div class="D-note">${tr("Draft translation. Caveats, signal texts and assistant answers are still in English.")}</div>` : ""}
        <div class="${sectionChanged ? "D-section" : ""} ${anim ? "D-anim" : ""}">${priorityBanner()}${{ overview: dOverview, sites: dSites, opportunities: dOpportunities, priorities: dPriorities, data: dData }[D.section](c)}</div>
      </main>
    </div></div>`;
}

function dTile(t) {
  const go = t.id === "optimisation_potential" ? "dNav('opportunities')" : "dNav('sites')";
  if (t.results) {
    const first = t.results[0], ser = D.charts?.series[first.kpi_id];
    return `<div class="card D-tile" onclick="${go}"><div class="muted">${esc(tr(t.name))}</div>${t.results.map((r) => `<div class="value">${fmtValue(r)}</div>${t.results.length > 1 ? `<div class="muted">${esc(tr(r.name))}</div>` : ""}<div class="D-tilemeta">${dDelta(r.kpi_id)}</div>`).join("")}
      ${ser && !ser.withheld ? chSpark(ser.values) : ""}
      <div>${status(first)}</div>${first.detail?.kind === "handprint" ? `<div class="caveat">${esc(first.detail.baseline_label)}, ${tr("may be overstated")}</div>` : ""}</div>`;
  }
  if (t.id === "optimisation_potential") {
    return `<div class="card D-tile" onclick="${go}"><div class="muted">${esc(tr(t.name))}</div><div class="value">${t.value}</div><div class="muted">${tr("fired results across {n} signals", { n: t.signal_count })}</div>${t.top_group ? `<div class="muted">${tr("Top: {x}", { x: esc(t.top_group.name) })}</div>` : ""}</div>`;
  }
  return `<div class="card D-tile" onclick="${go}"><div class="muted">${esc(tr(t.name))}</div><div class="value">${t.value}</div><div class="muted">${esc(tr(t.unit === "Sites" ? "Sites_unit" : t.unit))}</div></div>`;
}

function dKpiCard(r) {
  const ser = !r.withheld && D.charts?.series[r.kpi_id];
  return kpiCard(r, ser && !ser.withheld ? `<div class="D-tilemeta">${dDelta(r.kpi_id)}</div>${chSpark(ser.values)}` : "");
}

function dOverview(c) {
  const s = S.screen;
  const keys = c ? Object.keys(c.series).filter((k) => !c.series[k].withheld && c.series[k].values.some((v) => v !== null)) : [];
  if (!keys.includes(D.trendKpi)) D.trendKpi = keys[0] ?? "washed_kg";
  const ser = c?.series[D.trendKpi];
  const onTime = s.tiles.find((t) => t.id === "on_time_service_cycle_share")?.results?.[0];
  const waste = c?.waste, stages = c?.stages;
  return `${s.kam ? kamStrip() : ""}
    <div class="D-h2">${tr("Common indicators")} <span class="muted">${S.period}, ${tr(S.view + " view")}</span></div>
    <div class="D-tiles">${s.tiles.map(dTile).join("")}</div>
    <div class="D-row2">
      <div class="card"><div class="D-cardhead"><b>${tr("Monthly trend")}</b><span class="D-grow"></span>
        <select onchange="D.trendKpi=this.value;D.anim=true;render()">${keys.map((k) => `<option value="${k}" ${k === D.trendKpi ? "selected" : ""}>${esc(tr(c.series[k].name))}</option>`).join("")}</select></div>
        ${ser ? chArea(ser) : `<div class="D-skel"></div>`}
        <div class="muted">${tr("Months in the selected period are highlighted.")}</div></div>
      <div class="card"><div class="D-cardhead"><b>${esc(tr("On-time service cycle share"))}</b></div>${chRadial(onTime, c?.on_time_thresholds)}</div>
    </div>
    <div class="D-h2">${tr("Your priorities")} <span class="muted">${S.priorities.map(prName).join(", ")}</span><span class="D-grow"></span><button onclick="dNav('priorities')">${tr("Edit priorities")}</button></div>
    <div class="D-blocks">${s.blocks.map((b) => `<div class="D-block"><h3><span class="D-num">${b.position}</span>${esc(prName(b.priority_id))}</h3>
      ${b.results.map(dKpiCard).join("")}${b.signal_group ? groupCard(b.signal_group) : `<div class="muted">${tr("No fired signal for this priority.")}</div>`}</div>`).join("")}</div>
    <div class="D-row2 ${stages && !stages.withheld ? "half" : "single"}">
      <div class="card"><div class="D-cardhead"><b>${esc(tr("Textile waste by treatment route"))}</b><span class="D-grow"></span>${waste ? status(waste) : ""}</div>${chDonut(waste)}
        <div class="muted">${tr("Laundry outcome, the Customer cannot influence the route mix.")}</div></div>
      ${stages && !stages.withheld ? `<div class="card"><div class="D-cardhead"><b>${esc(tr("Turnaround by stage"))}</b><span class="badge kam">${tr("KAM view only")}</span></div>${chStacked(stages)}<div class="muted">${tr("Median hours per stage, by month")}</div></div>` : ""}
    </div>`;
}

function dSites() {
  const s = S.screen;
  const ids = [...new Set(["active_wearers", "on_time_service_cycle_share", ...s.blocks.flatMap((b) => b.results.map((r) => r.kpi_id))])].slice(0, 7);
  const key = JSON.stringify([S.customer_id, S.period, S.view, S.priorities]);
  if (D.sitesKey !== key) {
    D.sitesKey = key; D.sites = null;
    post("/api/sites", { customer_id: S.customer_id, period: S.period, view: S.view, priorities: S.priorities, kpi_ids: ids }).then((r) => { D.sites = r.json; D.anim = true; render(); });
  }
  if (!D.sites) return `<div class="muted">${tr("Loading Sites...")}</div>`;
  const cols = D.sites[0].results.map((r, i) => [i, r]).filter(([, r]) => !r.withheld && r.value !== null && typeof r.value === "number");
  if (D.siteKpi === null || !cols.some(([i]) => i === D.siteKpi)) D.siteKpi = cols[0]?.[0] ?? 0;
  const col = D.sites[0].results[D.siteKpi];
  const rows = D.sites.map((row) => ({ label: row.site.site_name, value: row.results[D.siteKpi]?.value ?? 0, on: S.site_id === row.site.site_id, onclick: `set({site_id:'${row.site.site_id}'});dNav('overview')` }))
    .sort((a, b) => b.value - a.value);
  return `<div class="card" style="margin-bottom:14px"><div class="D-cardhead"><b>${tr("Compare Sites")}</b><span class="D-grow"></span>
      <select onchange="D.siteKpi=+this.value;D.anim=true;render()">${cols.map(([i, r]) => `<option value="${i}" ${i === D.siteKpi ? "selected" : ""}>${esc(tr(r.name ?? r.kpi_id))}</option>`).join("")}</select></div>
      ${chHBars(rows, col.unit)}</div>
    <p class="muted">${tr("Click a Site to filter every page to it. Columns follow the priority blocks.")}</p>
    <div class="D-sites"><table><thead><tr><th>${tr("Site")}</th>${D.sites[0].results.map((r) => `<th>${esc(tr(r.name ?? r.kpi_id))}<div style="font-weight:400">${r.unit && r.unit !== "share" ? esc(tr(r.unit)) : ""}</div></th>`).join("")}<th>${tr("Fired signals")}</th></tr></thead><tbody>
    ${D.sites.map((row) => `<tr class="click" style="${S.site_id === row.site.site_id ? "background:var(--accent-soft)" : ""}" onclick="set({site_id:'${row.site.site_id}'});dNav('overview')">
      <td><b>${esc(row.site.site_name)}</b><div class="muted">${esc(row.site.site_type)}</div></td>${row.results.map((r) => `<td class="num">${fmtValue(r)}</td>`).join("")}
      <td>${row.fired.map((f) => `<span class="badge D-firedbadge">${esc(f.name.replace(" above peers", ""))} +${(f.gap * 100).toFixed(0)}%</span>`).join(" ")}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function dOpportunities() {
  const s = S.screen;
  return `<div class="D-h2">${tr("Signal groups")} <span class="muted">${tr("ranked by your priorities, then by gap")}</span></div>
    <div style="display:grid;gap:10px">${s.signal_groups.map(groupCard).join("") || `<div class="muted">${tr("No fired signals.")}</div>`}</div>
    <div class="D-h2">${tr("Proposed next steps")}</div>
    <div style="display:grid;gap:10px">${s.next_steps.map((n) => `<div class="card"><span class="D-num">${n.position}</span> ${esc(n.lever)} <span class="badge">${esc(n.lever_owner)}</span> <div class="muted">${esc(tr(n.status_text))}</div></div>`).join("")}</div>`;
}

function dPriorities() {
  return `<div class="card" style="max-width:560px">${priorityEditor()}</div>
    <p class="muted">${tr("Changes apply at once to Overview, Sites and Opportunities. The AI assistant can also change them, and you can undo that.")}</p>`;
}

function dData() {
  if (D.transparencyFor !== S.customer_id) {
    D.transparencyFor = S.customer_id; D.transparency = [];
    post("/api/review", { customer_id: S.customer_id, period: S.period, view: "Customer", priorities: S.priorities }).then((r) => { D.transparency = r.json.transparency; render(); });
  }
  return `<div style="display:grid;gap:10px;max-width:760px">${D.transparency.map((t) => `<div class="card"><b>${esc(t.name)}</b><div class="muted">${esc(t.text)}</div></div>`).join("")}</div>
    <p class="muted">${tr("Customer version shown. The KAM version adds factors, thresholds and guards.")}</p>`;
}

// ---- Tooltip for chart parts with data-tip ----
addEventListener("mousemove", (e) => {
  let tip = document.getElementById("D-tip");
  const el = e.target.closest?.("[data-tip]");
  if (!el || !document.body.classList.contains("D")) { if (tip) tip.style.opacity = 0; return; }
  if (!tip) { tip = document.createElement("div"); tip.id = "D-tip"; document.body.append(tip); }
  tip.textContent = el.dataset.tip; tip.style.opacity = 1;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = e.clientY + 14 + "px";
});
addEventListener("click", (e) => { if (D.menu && !e.target.closest(".D-prof")) { D.menu = false; render(); } });

// ---- AI button and modal. Lives in #ai, outside #app, so the dashboard can re-render under it. ----
function renderAI() {
  const el = document.getElementById("ai");
  if (S.variant !== "D" || S.page === "review") { el.innerHTML = ""; return; }
  if (D.wasBusy && !S.busy && !D.open) D.unread = true;
  D.wasBusy = !!S.busy;
  const typed = document.getElementById("dprompt")?.value;
  const hadFocus = document.activeElement?.id === "dprompt";
  const fab = `<button class="D-fab ${S.busy ? "busy" : ""} ${D.open ? "open" : ""}" title="${tr("AI assistant")}" onclick="dToggleAI()">${icon("ai")}${D.unread ? '<span class="dot"></span>' : ""}</button>`;
  if (!D.open) { el.innerHTML = fab; return; }
  let modal = el.querySelector(".D-modal");
  const justOpened = !modal;
  if (!modal) {
    el.innerHTML = `<div class="D-backdrop" onclick="dToggleAI()"></div><div class="D-modal" role="dialog" aria-label="${tr("AI assistant")}"></div>${fab}`;
    modal = el.querySelector(".D-modal");
  } else {
    el.querySelector(".D-fab").outerHTML = fab;
  }
  modal.innerHTML = `<div class="D-mhead"><span class="D-mlogo">${icon("ai")}</span><b>${tr("AI assistant")}</b><span class="seg"><button class="${D.tab === "ask" ? "on" : ""}" onclick="D.tab='ask';renderAI()">${tr("Ask")}</button><button class="${D.tab === "obs" ? "on" : ""}" onclick="D.tab='obs';renderAI()">${tr("Observations")}</button></span><button class="D-x" onclick="dToggleAI()">&times;</button></div>
    <div class="D-mbody">${D.tab === "ask" ? dAskBody() : dObsBody()}</div>
    ${D.tab === "ask" ? `<div class="D-mfoot"><div class="row"><textarea id="dprompt" rows="2" placeholder="${esc(tr("Ask about {x}...", { x: S.screen.customer.customer_name }))}" ${S.busy ? "disabled" : ""} onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();dAsk(this.value)}"></textarea>
      <button class="primary" onclick="dAsk(document.getElementById('dprompt').value)" ${S.busy ? "disabled" : ""}>${tr("Ask")}</button></div>
      <div class="muted">${tr(S.view + " view")}, ${S.period}${S.site_id ? ", " + esc(siteName(S.site_id)) : ""}. ${tr("Each question stands alone.")}</div></div>` : ""}`;
  const ta = document.getElementById("dprompt");
  if (ta && typed !== undefined && !S.busy) ta.value = typed;
  if (ta && !S.busy && (hadFocus || justOpened || D.refocus)) { ta.focus(); D.refocus = false; }
}

function dWorking() {
  return S.busy ? `<span class="D-working" id="working">${tr("Working... {n} s", { n: Math.round((Date.now() - S.startedAt) / 1000) })}</span>` : "";
}

function dAskBody() {
  let h = "";
  if (!S.answer && !S.error && !S.busy) {
    h += `<div class="muted">${tr("Try one of these:")}</div><div class="D-prompts">${S.meta.prompts.map((p) => `<span class="chip" onclick="ask(${esc(JSON.stringify(p))})">${esc(p)}</span>`).join("")}</div>`;
  }
  if (S.lastPrompt && (S.busy === "/api/assistant" || S.answer || S.error)) h += `<div class="D-bubble me">${esc(S.lastPrompt)}</div>`;
  if (S.busy === "/api/assistant") h += dWorking();
  if (S.error) h += `<div class="warn"><b>${esc(S.error.code)}</b>: ${esc(S.error.message)} <button onclick="ask(S.lastPrompt)">${tr("Try again")}</button></div>`;
  if (S.answer) {
    const a = S.answer;
    h += `<div class="D-bubble">${esc(a.answer)}</div>`;
    if (a.priority_change) h += `<div class="banner">${tr("Priorities changed to {x}.", { x: a.priority_change.priorities.slice(0, 3).map(prName).join(", ") })} <button onclick="undoPriorities()">${tr("Undo")}</button></div>`;
    if (a.unmatched_numbers.length) h += `<div class="warn">${tr("Numbers not found in the sources: {x}", { x: a.unmatched_numbers.map(esc).join(", ") })}</div>`;
    h += sourcesList(a.sources) + a.signal_groups.map(groupCard).join("");
  }
  return h;
}

function dObsBody() {
  return `<div style="display:flex;align-items:center;gap:10px"><button class="primary" onclick="observe()" ${S.busy ? "disabled" : ""}>${tr("Generate observations")}</button>${S.busy === "/api/observations" ? dWorking() : ""}</div>
    ${observationsView()}`;
}

function dAsk(prompt) {
  const ta = document.getElementById("dprompt"); if (ta) ta.value = "";
  D.refocus = true; ask(prompt);
}

function dToggleAI() {
  D.open = !D.open; D.unread = false; renderAI();
}
addEventListener("keydown", (e) => { if (e.key === "Escape" && D.open) dToggleAI(); if (e.key === "Escape" && D.menu) { D.menu = false; render(); } });
