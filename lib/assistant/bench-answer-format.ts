// PROTOTYPE, throwaway. Branch prototype/answer-format only, never merged.
// Benchmarks lib/assistant/prototype-answer-format.ts: runs the 6 Suggested_Prompts and both observation calls N times,
// scores every output with fixed automatic checks, and writes lib/assistant/prototype-answer-format.bench.md
// (summary) and .bench.json (every raw output).
//
//   node lib/assistant/bench-answer-format.ts --runs 10

import { writeFileSync } from "node:fs";

import { getMasterData, getOpportunitySignals, listKpis, signalGroups } from "../data.ts";
import { assistantAnswer, CUSTOMER_ID, MODEL, NUM_CTX, observations, PERIOD, PROMPTS, THINK } from "./prototype-answer-format.ts";

const runsAt = process.argv.indexOf("--runs");
const RUNS = runsAt > 0 ? Number(process.argv[runsAt + 1]) : 10;

// ---------------------------------------------------------------- ground truth

const sites = getMasterData().data.sites.filter((s) => s.customer_id === CUSTOMER_ID);
const city = (id: string) => sites.find((s) => s.site_id === id)!.site_name.replace(/^NorthStar\s+/, "");
const allCities = sites.map((s) => city(s.site_id));
const catalogue = getOpportunitySignals().catalogue;
const groups = { KAM: signalGroups({ customer_id: CUSTOMER_ID, view: "KAM" }), Customer: signalGroups({ customer_id: CUSTOMER_ID, view: "Customer" }) };
const signalCities = (view: "KAM" | "Customer", id: string) => groups[view].find((g) => g.signal_id === id)?.results.map((r) => city(r.site_id)) ?? [];
const firedCities = (view: "KAM" | "Customer") => [...new Set(groups[view].flatMap((g) => g.results.map((r) => city(r.site_id))))];
const ALLOCATION = signalCities("KAM", "garment_allocation_above_peers");
const WASHES = signalCities("KAM", "washes_per_garment_above_peers");
const definitionNumbers = new Set(catalogue.flatMap((e) => [...e.definition.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])));
const kpiIds = new Set(listKpis("KAM").map((k) => k.id));

const named = (text: string) => allCities.filter((c) => new RegExp(`(^|[^\\p{L}])${c}([^\\p{L}]|$)`, "u").test(text));
// Rule 7: a signal flags a Site for discussion, it is not proof of a problem.
const BANNED = /\b(issues?|problems?|inefficien\w*|overuse|poor|failing|proves?)\b/i;
const EM_DASH = /—/;

/** Unmatched numbers, minus thresholds quoted from the signal definitions (a known false positive of the check). */
const realUnmatched = (u: string[]) => u.filter((n) => !definitionNumbers.has(n.replace(/,/g, "")));

type Check = { name: string; pass: boolean };
type Scored = { id: string; checks: Check[]; pass: boolean; seconds: number; notes: string[] };

function scoreAnswer(i: number, r: Awaited<ReturnType<typeof assistantAnswer>>): Scored {
  const text = r.answer;
  const calls = r.log.join("\n");
  const notes: string[] = [];
  const unmatched = realUnmatched(r.unmatched_numbers);
  if (r.unmatched_numbers.length !== unmatched.length) notes.push(`threshold quotes flagged: ${r.unmatched_numbers.filter((n) => !unmatched.includes(n)).join(", ")}`);
  if (unmatched.length) notes.push(`unmatched: ${unmatched.join(", ")}`);
  const common: Check[] = [
    { name: "no unmatched numbers", pass: unmatched.length === 0 },
    { name: "no rule 7 words", pass: !BANNED.test(text) },
    { name: "no em dash", pass: !EM_DASH.test(text) },
    { name: "no model error", pass: !text.startsWith("(model_error") },
  ];
  const n = named(text);
  // The overview and set_priorities now carry the signal groups too, so any of the three gives the model the signals.
  const hadSignals = /get_signal_groups|get_overview|set_priorities/.test(calls.replace(/FAILED.*$/gm, ""));
  if (r.retried.length) notes.push(`retried for: ${r.retried.join(" / ")}`);
  if (r.remaining_problems.length) notes.push(`still after retry: ${r.remaining_problems.join(" / ")}`);
  if (!/\b(owner|owned)\b/i.test(text) && r.signal_groups.length) notes.push("owner only in attached signal groups, not in text");
  if (r.signal_groups.length) notes.push(`attached signal groups: ${r.signal_groups.map((g) => `${g.signal_id} (owner: ${g.lever_owner})`).join(", ")}`);
  let specific: Check[] = [];
  if (i === 1) {
    specific = [
      { name: "fetched figures", pass: r.sources.length > 0 },
      { name: "water saved names its baseline", pass: /local laundry/i.test(text) && /water saved/i.test(text) },
    ];
  } else if (i === 2) {
    const p = r.priority_change?.priorities ?? [];
    specific = [
      { name: "priorities set Water, Emissions first", pass: p[0] === "Water" && p[1] === "Emissions" },
      { name: "fetched figures after set_priorities", pass: r.sources.length > 0 },
    ];
  } else if (i === 3) {
    const wrong = n.filter((c) => !ALLOCATION.includes(c));
    notes.push(`Sites named: ${n.join(", ") || "none"}`);
    if (n.length && n.every((c) => WASHES.includes(c))) notes.push("named the washes-per-garment signal instead");
    specific = [
      { name: "had the signal groups", pass: hadSignals },
      { name: "names at least 3 garment-allocation Sites", pass: n.filter((c) => ALLOCATION.includes(c)).length >= 3 },
      { name: "names no other Site", pass: wrong.length === 0 },
    ];
  } else if (i === 4) {
    const fired = firedCities("Customer");
    const wrong = n.filter((c) => !fired.includes(c));
    if (wrong.length) notes.push(`Sites not in any fired signal: ${wrong.join(", ")}`);
    specific = [
      { name: "had the signal groups", pass: hadSignals },
      { name: "names Sites from the top signal", pass: signalCities("Customer", "washes_per_garment_above_peers").some((c) => n.includes(c)) },
      { name: "names only fired Sites", pass: wrong.length === 0 },
      { name: "lever owners shown (text or attached signal groups)", pass: /\b(owner|owned)\b/i.test(text) || (r.signal_groups.length > 0 && r.signal_groups.every((g) => !!g.lever_owner)) },
      { name: "never calls a next step agreed", pass: !/\b(we|you|they) (have )?agreed\b|\bis agreed\b|\bwere agreed\b/i.test(text) },
    ];
  } else if (i === 5) {
    const whole = r.sources.some((s) => !("withheld" in s) && s.kpi_id === "water_saved" && !s.scope.site_id && s.baseline_id === "B_LOCAL");
    if (n.length) notes.push(`Sites named: ${n.join(", ")}`);
    specific = [
      { name: "whole Customer, not one Site", pass: whole && n.length === 0 },
      { name: "names the baseline", pass: /local laundry/i.test(text) },
      { name: "has a Caveats line", pass: /caveats?:/i.test(text) },
    ];
  } else if (i === 6) {
    const points = text.split("\n").filter((l) => /^\s*(\d+[.)]|[-*•])\s/.test(l)).length;
    notes.push(`${points} points`);
    specific = [{ name: "exactly 5 points", pass: points === 5 }];
  } else if (i === 7) {
    specific = [
      { name: 'says "the data does not hold"', pass: /data does not hold/i.test(text) },
      { name: "gives no euro figure", pass: !/(€|\beur(os?)?\b)\s*\d|\d[\d,.]*\s*(€|\beur(os?)?\b)/i.test(text) },
    ];
  }
  const checks = [...specific, ...common];
  return { id: `P${i}`, checks, pass: checks.every((c) => c.pass), seconds: r.meta.seconds, notes };
}

function scoreObservations(view: "KAM" | "Customer", r: Awaited<ReturnType<typeof observations>>): Scored {
  const notes: string[] = [];
  const obs = r.observations;
  const unmatched = obs.flatMap((o) => realUnmatched(o.unmatched_numbers));
  const banned = obs.filter((o) => BANNED.test(o.text));
  const badTags = obs.flatMap((o) =>
    o.signal_ids.filter((id) => {
      const cities = signalCities(view, id);
      return cities.length === 0 || !named(o.text).some((c) => cities.includes(c));
    }).map((id) => `${id} on "${o.text.slice(0, 40)}..."`),
  );
  const badKpis = obs.flatMap((o) => o.kpi_ids.filter((id) => !kpiIds.has(id)));
  if (r.retried.length) notes.push(`retried for: ${r.retried.join(" / ")}`);
  if (unmatched.length) notes.push(`unmatched: ${unmatched.join(", ")}`);
  if (banned.length) notes.push(`rule 7: ${banned.map((o) => o.text).join(" | ")}`);
  if (badTags.length) notes.push(`wrong signal tags: ${badTags.join("; ")}`);
  if (badKpis.length) notes.push(`not KPI ids: ${badKpis.join(", ")}`);
  const checks: Check[] = [
    { name: "1 to 3 observations", pass: obs.length >= 1 && obs.length <= 3 },
    { name: "no unmatched numbers", pass: unmatched.length === 0 },
    { name: "no rule 7 words", pass: banned.length === 0 },
    { name: "at most 40 words each", pass: obs.every((o) => o.text.split(/\s+/).length <= 40) },
    { name: "signal tags match the text", pass: badTags.length === 0 },
    { name: "kpi_ids are KPI ids", pass: badKpis.length === 0 },
    { name: "no em dash", pass: obs.every((o) => !EM_DASH.test(o.text)) },
  ];
  return { id: `Obs ${view}`, checks, pass: checks.every((c) => c.pass), seconds: r.meta.seconds, notes };
}

// ---------------------------------------------------------------- run

const raw: unknown[] = [];
const scored: Scored[][] = [];
const started = Date.now();
for (let run = 1; run <= RUNS; run++) {
  const row: Scored[] = [];
  for (const [k, p] of PROMPTS.entries()) {
    try {
      const r = await assistantAnswer({ customer_id: CUSTOMER_ID, period: PERIOD, view: p.view }, p.prompt);
      raw.push({ run, prompt: k + 1, answer: r.answer, retried: r.retried, remaining_problems: r.remaining_problems, log: r.log, unmatched: r.unmatched_numbers, priority_change: r.priority_change, meta: r.meta });
      row.push(scoreAnswer(k + 1, r));
    } catch (e) {
      raw.push({ run, prompt: k + 1, error: String(e) });
      row.push({ id: `P${k + 1}`, checks: [{ name: "ran without error", pass: false }], pass: false, seconds: 0, notes: [String(e)] });
    }
  }
  for (const view of ["KAM", "Customer"] as const) {
    try {
      const r = await observations({ customer_id: CUSTOMER_ID, period: PERIOD, view });
      raw.push({ run, observations: view, items: r.observations.map((o) => ({ text: o.text, kpi_ids: o.kpi_ids, signal_ids: o.signal_ids, unmatched: o.unmatched_numbers })), meta: r.meta });
      row.push(scoreObservations(view, r));
    } catch (e) {
      raw.push({ run, observations: view, error: String(e) });
      row.push({ id: `Obs ${view}`, checks: [{ name: "valid JSON", pass: false }], pass: false, seconds: 0, notes: [String(e)] });
    }
  }
  scored.push(row);
  console.error(`run ${run}/${RUNS}: ${row.map((s) => `${s.id} ${s.pass ? "pass" : "FAIL"}`).join(", ")}`);
}

// ---------------------------------------------------------------- report

const ids = scored[0].map((s) => s.id);
const labels: Record<string, string> = Object.fromEntries(PROMPTS.map((p, i) => [`P${i + 1}`, `${i + 1}. ${p.prompt} (${p.view})`]));
labels["Obs KAM"] = "Generate observations, KAM view";
labels["Obs Customer"] = "Generate observations, Customer view";
const all = (id: string) => scored.map((row) => row.find((s) => s.id === id)!);
const pct = (a: number, b: number) => `${a}/${b}`;
const secs = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `median ${s[Math.floor(s.length / 2)]} s, max ${s[s.length - 1]} s`;
};

const out: string[] = [
  `# Benchmark: Answer and observation format`,
  ``,
  `Model \`${MODEL}\` in Ollama, 100% GPU, num_ctx ${NUM_CTX}, thinking ${THINK ? "on" : "off"}, temperature 0.3. ${RUNS} runs, ${Math.round((Date.now() - started) / 1000)} s total, ${new Date().toISOString()}. After round 4 of fixes (server checks that the Sites listed belong to the signal named, Caveats line skipped by the baseline check; round 3: pick the signal group matching the question; round 2: no ranges, baseline checked per saved figure, owners attached by the server instead of retried, exact point count; on top of round 1: set_priorities returns the overview, the overview carries the signal groups, site_id "all" is the whole Customer, one server retry, server-owned tags). The tag checks on observations are now enforced by the server, so they pass by construction. Before any fixes: prototype-answer-format.bench.before.md. After round 1: prototype-answer-format.bench.after1.md. After round 2: prototype-answer-format.bench.after2.md. After round 3: prototype-answer-format.bench.after3.md.`,
  ``,
  `| Item | Fully passed | Time |`,
  `|---|---|---|`,
  ...ids.map((id) => `| ${labels[id]} | ${pct(all(id).filter((s) => s.pass).length, RUNS)} | ${secs(all(id).map((s) => s.seconds))} |`),
  ``,
  `## Checks`,
  ``,
];
for (const id of ids) {
  out.push(`### ${labels[id]}`, ``);
  const names = [...new Set(all(id).flatMap((s) => s.checks.map((c) => c.name)))];
  for (const nm of names) {
    const got = all(id).map((s) => s.checks.find((c) => c.name === nm)).filter(Boolean) as Check[];
    out.push(`- ${nm}: ${pct(got.filter((c) => c.pass).length, got.length)}`);
  }
  const notes = all(id).flatMap((s, r) => s.notes.map((n) => `run ${r + 1}: ${n}`));
  if (notes.length) out.push(``, `<details><summary>Notes</summary>`, ``, ...notes.map((n) => `- ${n}`), ``, `</details>`);
  out.push(``);
}
writeFileSync(new URL("./prototype-answer-format.bench.md", import.meta.url), out.join("\n"));
writeFileSync(new URL("./prototype-answer-format.bench.json", import.meta.url), JSON.stringify(raw, null, 1));
console.error("wrote prototype-answer-format.bench.md and .bench.json");
