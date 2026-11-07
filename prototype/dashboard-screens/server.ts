// PROTOTYPE, throw me away. Answers "Dashboard screens" (issue 16): what the screens look like and how a user
// moves between them. Values are real 2025 results from runKpi. The assistant and observations routes are stubs
// that follow the contract in "Assistant route contract" (issue 15). No Next.js: one node:http server so it runs
// with no install. Run with `npm run prototype:dashboard`, then open http://localhost:4316.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import {
  getCustomerPriorities,
  getMasterData,
  getOpportunitySignals,
  getViewsAndReview,
  listKpis,
  runKpi,
} from "../../lib/data.ts";

const PORT = 4316;
type View = "KAM" | "Customer";

const master = getMasterData().data;
const priorities = getCustomerPriorities();
const signals = getOpportunitySignals();
const vr = getViewsAndReview().data;

// Stand-in for firstScreen and signalGroups from "Calculation functions for priorities, signals and the first
// screen" (issue 13), not built yet. Re-ranks the stored default groups for a changed priority order.
function signalGroups(customer_id: string, view: View, order: string[]) {
  const defaults = vr.defaults_by_customer.find((d) => d.customer_id === customer_id)!;
  const groups = defaults.views[view].signal_groups.map((g) => {
    const entry = signals.catalogue.find((s) => s.id === g.signal_id)! as any;
    const positions = (entry.customer_priority_ids as string[]).map((p) => order.indexOf(p)).filter((i) => i >= 0);
    const best = positions.length ? Math.min(...positions) : null;
    return { ...g, priority_ids: entry.customer_priority_ids as string[], matched_priority_id: best === null ? null : order[best], _pos: best ?? 99 };
  });
  groups.sort((a, b) => a._pos - b._pos || b.largest_gap - a.largest_gap);
  return groups.map(({ _pos, ...g }, i) => ({ ...g, rank: i + 1, name: (signals.catalogue.find((s) => s.id === g.signal_id) as any).name }));
}

function screen(body: any) {
  const { customer_id, site_id, period, view } = body;
  const order: string[] = body.priorities;
  const scope = site_id ? { customer_id, site_id } : { customer_id };
  const q = (kpi_id: string) => runKpi(kpi_id, { scope, period, view });
  const kamOnly = new Set(listKpis("KAM").filter((k) => k.view === "KAM").map((k) => k.id));
  const common = new Set(vr.first_screen.common_tiles.flatMap((t) => t.kpi_ids));
  const groups = signalGroups(customer_id, view, order).filter((g) => !site_id || g.results.some((r) => r.site_id === site_id));
  const sites = master.sites.filter((s) => s.customer_id === customer_id);

  const tiles = vr.first_screen.common_tiles.map((t) => {
    if (t.id === "site_count") return { id: t.id, name: t.name, text: t.text, value: site_id ? 1 : sites.length, unit: "Sites" };
    if (t.id === "optimisation_potential") {
      return {
        id: t.id, name: t.name, text: t.text,
        value: groups.reduce((n, g) => n + (site_id ? g.results.filter((r) => r.site_id === site_id).length : g.fired_count), 0),
        unit: "fired signal results", top_group: groups[0] ?? null, signal_count: groups.length,
      };
    }
    return { id: t.id, name: t.name, text: t.text, results: t.kpi_ids.map(q) };
  });

  const blocks = order.slice(0, vr.first_screen.priority_blocks.max_blocks).map((pid, i) => {
    const head = vr.first_screen.priority_blocks.headline_kpis.find((h) => h.priority_id === pid)!;
    const kpi_ids = head.kpi_ids.filter((k) => !common.has(k) && !(view === "Customer" && kamOnly.has(k)));
    return {
      position: i + 1,
      priority_id: pid,
      name: priorities.catalogue.find((p) => p.id === pid)!.name,
      results: kpi_ids.map(q),
      signal_group: groups.find((g) => g.priority_ids.includes(pid)) ?? null,
    };
  });

  const customer = master.customers.find((c) => c.customer_id === customer_id)!;
  const kam = view === "KAM"
    ? {
        account_health: q("account_health"),
        dashboard_emphasis: priorities.data.dashboard_emphasis.find((e) => e.industry === customer.industry) ?? null,
      }
    : null;

  const next_steps = groups.slice(0, 3).map((g, i) => ({
    position: i + 1, signal_id: g.signal_id, lever: g.lever, lever_owner: g.lever_owner,
    results: g.results, status_text: "Proposed, to be agreed in the meeting.",
  }));

  return { customer, tiles, blocks, kam, signal_groups: groups, next_steps };
}

// Site drill-down: one row per Site, the KPIs the caller asks for.
function siteTable(body: any) {
  const { customer_id, period, view, kpi_ids } = body;
  const groups = signalGroups(customer_id, view, body.priorities);
  return master.sites
    .filter((s) => s.customer_id === customer_id)
    .map((s) => ({
      site: s,
      results: (kpi_ids as string[]).map((k) => runKpi(k, { scope: { customer_id, site_id: s.site_id }, period, view })),
      fired: groups.flatMap((g) => g.results.filter((r) => r.site_id === s.site_id).map((r) => ({ signal_id: g.signal_id, name: g.name, gap: r.gap, product_id: r.product_id }))),
    }));
}

// Review page: the 5 parts, Customer view content only.
function review(body: any) {
  const { customer_id, period } = body;
  const s = screen({ ...body, view: "Customer" });
  const parts = vr.review.parts.map((p) => ({
    name: p.name, text: p.text, split_group: p.split_group,
    results: p.catalogue_refs
      .filter((r) => r.file !== "opportunity-signals" && r.file !== "customer-priorities" && r.file !== "views-and-review")
      .flatMap((r) => r.catalogue_ids)
      .filter((id) => listKpis("Customer").some((k) => k.id === id))
      .map((id) => runKpi(id, { scope: { customer_id }, period, view: "Customer" })),
  }));
  return { customer: s.customer, parts, split: vr.review.split, signal_groups: s.signal_groups, next_steps: s.next_steps, transparency: vr.views.data_transparency.customer.items };
}

// Stubs of POST /api/assistant and POST /api/observations, in the contract's response shape.
const PRIORITY_WORDS: [RegExp, string][] = [
  [/water/i, "water"], [/emission|co2|carbon/i, "emissions"], [/circular|repair|waste/i, "circularity"],
  [/reliab|on-time|late|turnaround/i, "service_reliability"], [/utili[sz]|allocation|textile-allocation/i, "garment_utilisation"],
  [/trace|scan/i, "traceability"], [/improv/i, "improvement"],
];

function assistant(body: any) {
  if (/error/i.test(body.prompt)) return { status: 504, json: { error: { code: "timeout", message: "The model took longer than 90 s." } } };
  const named = PRIORITY_WORDS.filter(([re]) => re.test(body.prompt)).map(([, id]) => id);
  const wantsFocus = /focus|prioriti|personal/i.test(body.prompt) && named.length > 0;
  const newOrder = wantsFocus ? [...new Set([...named, ...body.priorities])] : null;
  const s = screen({ ...body, priorities: newOrder ?? body.priorities });
  const sources = [...s.tiles.flatMap((t: any) => t.results ?? []).slice(0, 3), ...s.blocks.flatMap((b) => b.results).slice(0, 3)];
  const fmt = (r: any) => (r.withheld ? "withheld" : `${r.name} ${Number(r.value).toLocaleString("en", { maximumFractionDigits: 2 })} ${r.unit}`);
  return {
    status: 200,
    json: {
      answer: (newOrder ? `I moved ${named.join(" and ")} to the top of the priorities. ` : "") +
        `STUB ANSWER. For ${s.customer.customer_name} in ${body.period}: ${sources.slice(0, 3).map(fmt).join("; ")}. ` +
        (s.signal_groups[0] ? `The top lever is "${s.signal_groups[0].lever}" (${s.signal_groups[0].lever_owner}).` : ""),
      sources,
      signal_groups: s.signal_groups.slice(0, 2),
      priority_change: newOrder ? { priorities: newOrder } : null,
      unmatched_numbers: /steering/i.test(body.prompt) ? ["12%"] : [],
    },
  };
}

function observations(body: any) {
  const s = screen(body);
  return {
    status: 200,
    json: {
      observations: s.signal_groups.slice(0, 3).map((g: any) => ({
        text: `STUB OBSERVATION. ${g.name}: ${g.fired_count} result(s), largest gap ${(g.largest_gap * 100).toFixed(0)}% above peers. Lever: ${g.lever}`,
        sources: s.blocks.flatMap((b) => b.results).slice(0, 2),
        signal_groups: [g],
        unmatched_numbers: [],
      })),
    },
  };
}

const meta = {
  customers: master.customers,
  sites: master.sites,
  months: master.months,
  priorities: priorities.catalogue.map((p) => ({ id: p.id, name: p.name })),
  default_order: priorities.data.default_order,
  prompts: [
    "Show the value created for NorthStar Foods Group in 2025.",
    "Focus on water and emissions for the food-industry sites.",
    "Which sites have the greatest textile-allocation optimization potential?",
    "How can we improve our performance next year?",
    "Compare our circular service with local laundry.",
    "Prepare five discussion points for the annual steering committee.",
  ],
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

createServer(async (req, res) => {
  const send = (status: number, json: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(json));
  };
  try {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(readFileSync(new URL("./index.html", import.meta.url)));
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    if (req.url === "/api/meta") return send(200, meta);
    if (req.url === "/api/screen") return send(200, screen(body));
    if (req.url === "/api/sites") return send(200, siteTable(body));
    if (req.url === "/api/review") return send(200, review(body));
    if (req.url === "/api/assistant") { await delay(4000); const r = assistant(body); return send(r.status, r.json); }
    if (req.url === "/api/observations") { await delay(5000); const r = observations(body); return send(r.status, r.json); }
    send(404, { error: { code: "not_found", message: req.url } });
  } catch (e) {
    send(400, { error: { code: "bad_request", message: String(e) } });
  }
}).listen(PORT, () => console.log(`Dashboard screens prototype: http://localhost:${PORT}  (?variant=A, B or C; ?page=review)`));
