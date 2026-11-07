// PROTOTYPE, throw me away. Variant D: the left bar is the menu, the AI is a round button bottom right that opens
// a modal. Uses the shared state S and helpers from index.html, which load after this file but before any call.

const D_ICON = {
  overview: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
  sites: '<path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>',
  opportunities: '<path d="M3 17l6-6 4 4 8-8v6h2V3h-10v2h6l-6 6-4-4-8 8z"/>',
  priorities: '<path d="M3 5h12v2H3zm0 6h8v2H3zm0 6h4v2H3zm14-6l4 4-4 4v-3h-4v-2h4z"/>',
  data: '<path d="M12 3C7 3 3 4.8 3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7c0-2.2-4-4-9-4zm0 2c4 0 7 1.3 7 2s-3 2-7 2-7-1.3-7-2 3-2 7-2z"/>',
  review: '<path d="M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8 12h8v2H8zm0 4h8v2H8z"/>',
  ai: '<path d="M12 2l1.8 4.7L18.5 8.5l-4.7 1.8L12 15l-1.8-4.7L5.5 8.5l4.7-1.8zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9zM6 15l.7 1.6 1.6.7-1.6.7L6 19.6l-.7-1.6-1.6-.7 1.6-.7z"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="currentColor">${D_ICON[k]}</svg>`;

const D_URL = new URL(location.href);
const D = { section: D_URL.searchParams.get("section") || "overview", lastSection: null, sites: null, sitesKey: "", transparency: [], transparencyFor: null, open: D_URL.searchParams.get("ai") === "open", tab: "ask", unread: false, wasBusy: false, refocus: false };

function dNav(section) {
  D.section = section; url.searchParams.set("section", section); history.replaceState(null, "", url); render(); window.scrollTo(0, 0);
}

function VariantD() {
  const s = S.screen;
  const fired = s.signal_groups.reduce((n, g) => n + g.fired_count, 0);
  const items = [
    ["overview", "Overview"], ["sites", "Sites"], ["opportunities", "Opportunities", fired], ["priorities", "Priorities"], ["data", "Data and assumptions"],
  ];
  const fade = D.section !== D.lastSection ? "D-section" : ""; D.lastSection = D.section;
  const titles = { overview: "Overview", sites: "Sites", opportunities: "Opportunities", priorities: "Customer priorities", data: "Data and assumptions" };
  return `<div class="D-wrap"><nav class="D-nav">
      <div class="D-logo"><i></i>ValueLens</div>
      ${customerSelect()}
      <div class="D-navlabel">Dashboard</div>
      ${items.map(([k, l, n]) => `<a class="D-item ${D.section === k ? "on" : ""}" onclick="dNav('${k}')">${icon(k)}${l}${n ? `<span class="count">${n}</span>` : ""}</a>`).join("")}
      <div class="D-navlabel">Export</div>
      <a class="D-item" onclick="openReview()">${icon("review")}Print review</a>
      <div class="D-navfoot">${esc(s.customer.industry)}, ${esc(s.customer.segment)}<br>Synthetic data, 2025</div>
    </nav>
    <main class="D-main"><div class="D-head">
        <div><h1>${titles[D.section]}</h1><div class="sub">${esc(s.customer.customer_name)}${S.site_id ? " / " + esc(siteName(S.site_id)) : ""}</div></div>
        ${siteFilter()}<span class="D-grow"></span>${periodSelect()}${viewToggle()}
      </div>
      <div class="${fade}">${priorityBanner()}${{ overview: dOverview, sites: dSites, opportunities: dOpportunities, priorities: dPriorities, data: dData }[D.section]()}</div>
    </main></div>`;
}

function dTile(t) {
  const go = t.id === "optimisation_potential" ? "dNav('opportunities')" : "dNav('sites')";
  if (t.results) {
    return `<div class="card" onclick="${go}"><div class="muted">${esc(t.name)}</div>${t.results.map((r) => `<div class="value">${fmtValue(r)}</div>${t.results.length > 1 ? `<div class="muted">${esc(r.name)}</div>` : ""}<div>${status(r)}</div>${r.detail?.kind === "handprint" ? `<div class="caveat">${esc(r.detail.baseline_label)}, may be overstated</div>` : ""}`).join("")}</div>`;
  }
  if (t.id === "optimisation_potential") {
    return `<div class="card" onclick="${go}"><div class="muted">${esc(t.name)}</div><div class="value">${t.value}</div><div class="muted">fired results across ${t.signal_count} signals</div>${t.top_group ? `<div class="muted">Top: ${esc(t.top_group.name)}</div>` : ""}</div>`;
  }
  return `<div class="card" onclick="${go}"><div class="muted">${esc(t.name)}</div><div class="value">${t.value}</div><div class="muted">${esc(t.unit)}</div></div>`;
}

function dOverview() {
  const s = S.screen;
  return `${s.kam ? kamStrip() : ""}
    <div class="D-h2">Common indicators <span class="muted">${S.period}, ${S.view} view</span></div>
    <div class="D-tiles">${s.tiles.map(dTile).join("")}</div>
    <div class="D-h2">Your priorities <span class="muted">${S.priorities.map(prName).join(", ")}</span><span class="D-grow"></span><button onclick="dNav('priorities')">Edit priorities</button></div>
    <div class="D-blocks">${s.blocks.map((b) => `<div class="D-block"><h3><span class="D-num">${b.position}</span>${esc(b.name)}</h3>
      ${b.results.map((r) => kpiCard(r)).join("")}${b.signal_group ? groupCard(b.signal_group) : `<div class="muted">No fired signal for this priority.</div>`}</div>`).join("")}</div>`;
}

function dSites() {
  const s = S.screen;
  const ids = [...new Set(["active_wearers", "on_time_service_cycle_share", ...s.blocks.flatMap((b) => b.results.map((r) => r.kpi_id))])].slice(0, 7);
  const key = JSON.stringify([S.customer_id, S.period, S.view, S.priorities]);
  if (D.sitesKey !== key) {
    D.sitesKey = key; D.sites = null;
    post("/api/sites", { customer_id: S.customer_id, period: S.period, view: S.view, priorities: S.priorities, kpi_ids: ids }).then((r) => { D.sites = r.json; render(); });
  }
  if (!D.sites) return `<div class="muted">Loading Sites...</div>`;
  return `<p class="muted">Click a Site to filter every page to it. Columns follow the priority blocks.</p>
    <div class="D-sites"><table><thead><tr><th>Site</th>${D.sites[0].results.map((r) => `<th>${esc(r.name ?? r.kpi_id)}<div style="font-weight:400">${r.unit && r.unit !== "share" ? esc(r.unit) : ""}</div></th>`).join("")}<th>Fired signals</th></tr></thead><tbody>
    ${D.sites.map((row) => `<tr class="click" style="${S.site_id === row.site.site_id ? "background:var(--accent-soft)" : ""}" onclick="set({site_id:'${row.site.site_id}'});dNav('overview')">
      <td><b>${esc(row.site.site_name)}</b><div class="muted">${esc(row.site.site_type)}</div></td>${row.results.map((r) => `<td class="num">${fmtValue(r)}</td>`).join("")}
      <td>${row.fired.map((f) => `<span class="badge" style="background:#fee2e2;color:#b91c1c">${esc(f.name.replace(" above peers", ""))} +${(f.gap * 100).toFixed(0)}%</span>`).join(" ")}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function dOpportunities() {
  const s = S.screen;
  return `<div class="D-h2">Signal groups <span class="muted">ranked by your priorities, then by gap</span></div>
    <div style="display:grid;gap:10px">${s.signal_groups.map(groupCard).join("") || `<div class="muted">No fired signals.</div>`}</div>
    <div class="D-h2">Proposed next steps</div>
    <div style="display:grid;gap:10px">${s.next_steps.map((n) => `<div class="card"><span class="D-num">${n.position}</span> ${esc(n.lever)} <span class="badge">${esc(n.lever_owner)}</span> <div class="muted">${esc(n.status_text)}</div></div>`).join("")}</div>`;
}

function dPriorities() {
  return `<div class="card" style="max-width:560px">${priorityEditor()}</div>
    <p class="muted">Changes apply at once to Overview, Sites and Opportunities. The AI assistant can also change them, and you can undo that.</p>`;
}

function dData() {
  if (D.transparencyFor !== S.customer_id) {
    D.transparencyFor = S.customer_id; D.transparency = [];
    post("/api/review", { customer_id: S.customer_id, period: S.period, view: "Customer", priorities: S.priorities }).then((r) => { D.transparency = r.json.transparency; render(); });
  }
  return `<div style="display:grid;gap:10px;max-width:760px">${D.transparency.map((t) => `<div class="card"><b>${esc(t.name)}</b><div class="muted">${esc(t.text)}</div></div>`).join("")}</div>
    <p class="muted">Customer version shown. The KAM version adds factors, thresholds and guards.</p>`;
}

// ---- AI button and modal. Lives in #ai, outside #app, so the dashboard can re-render under it. ----
function renderAI() {
  const el = document.getElementById("ai");
  if (S.variant !== "D" || S.page === "review") { el.innerHTML = ""; return; }
  if (D.wasBusy && !S.busy && !D.open) D.unread = true;
  D.wasBusy = !!S.busy;
  const typed = document.getElementById("dprompt")?.value;
  const hadFocus = document.activeElement?.id === "dprompt";
  const fab = `<button class="D-fab ${S.busy ? "busy" : ""}" title="AI assistant" onclick="dToggleAI()">${icon("ai")}${D.unread ? '<span class="dot"></span>' : ""}</button>`;
  if (!D.open) { el.innerHTML = fab; return; }
  let modal = el.querySelector(".D-modal");
  const justOpened = !modal;
  if (!modal) {
    el.innerHTML = `<div class="D-backdrop" onclick="dToggleAI()"></div><div class="D-modal" role="dialog" aria-label="AI assistant"></div>${fab}`;
    modal = el.querySelector(".D-modal");
  } else {
    el.querySelector(".D-fab").outerHTML = fab;
  }
  modal.innerHTML = `<div class="D-mhead"><b>AI assistant</b><span class="seg"><button class="${D.tab === "ask" ? "on" : ""}" onclick="D.tab='ask';renderAI()">Ask</button><button class="${D.tab === "obs" ? "on" : ""}" onclick="D.tab='obs';renderAI()">Observations</button></span><button class="D-x" onclick="dToggleAI()">&times;</button></div>
    <div class="D-mbody">${D.tab === "ask" ? dAskBody() : dObsBody()}</div>
    ${D.tab === "ask" ? `<div class="D-mfoot"><div class="row"><textarea id="dprompt" rows="2" placeholder="Ask about ${esc(S.screen.customer.customer_name)}..." ${S.busy ? "disabled" : ""} onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();dAsk(this.value)}"></textarea>
      <button class="primary" onclick="dAsk(document.getElementById('dprompt').value)" ${S.busy ? "disabled" : ""}>Ask</button></div>
      <div class="muted">${S.view} view, ${S.period}${S.site_id ? ", " + esc(siteName(S.site_id)) : ""}. Each question stands alone.</div></div>` : ""}`;
  const ta = document.getElementById("dprompt");
  if (ta && typed !== undefined && !S.busy) ta.value = typed;
  if (ta && !S.busy && (hadFocus || justOpened || D.refocus)) { ta.focus(); D.refocus = false; }
}

function dWorking() {
  return S.busy ? `<span class="D-working" id="working">Working... ${Math.round((Date.now() - S.startedAt) / 1000)} s</span>` : "";
}

function dAskBody() {
  let h = "";
  if (!S.answer && !S.error && !S.busy) {
    h += `<div class="muted">Try one of these:</div><div class="D-prompts">${S.meta.prompts.map((p) => `<span class="chip" onclick="ask(${esc(JSON.stringify(p))})">${esc(p)}</span>`).join("")}</div>`;
  }
  if (S.lastPrompt && (S.busy === "/api/assistant" || S.answer || S.error)) h += `<div class="D-bubble me">${esc(S.lastPrompt)}</div>`;
  if (S.busy === "/api/assistant") h += dWorking();
  if (S.error) h += `<div class="warn"><b>${esc(S.error.code)}</b>: ${esc(S.error.message)} <button onclick="ask(S.lastPrompt)">Try again</button></div>`;
  if (S.answer) {
    const a = S.answer;
    h += `<div class="D-bubble">${esc(a.answer)}</div>`;
    if (a.priority_change) h += `<div class="banner">Priorities changed to ${a.priority_change.priorities.slice(0, 3).map(prName).join(", ")}. <button onclick="undoPriorities()">Undo</button></div>`;
    if (a.unmatched_numbers.length) h += `<div class="warn">Numbers not found in the sources: ${a.unmatched_numbers.map(esc).join(", ")}</div>`;
    h += sourcesList(a.sources) + a.signal_groups.map(groupCard).join("");
  }
  return h;
}

function dObsBody() {
  return `<div style="display:flex;align-items:center;gap:10px"><button class="primary" onclick="observe()" ${S.busy ? "disabled" : ""}>Generate observations</button>${S.busy === "/api/observations" ? dWorking() : ""}</div>
    ${observationsView()}`;
}

function dAsk(prompt) {
  const ta = document.getElementById("dprompt"); if (ta) ta.value = "";
  D.refocus = true; ask(prompt);
}

function dToggleAI() {
  D.open = !D.open; D.unread = false; renderAI();
}
addEventListener("keydown", (e) => { if (e.key === "Escape" && D.open) dToggleAI(); });
