// The demo benchmark (Spec: AI assistant #39, issue #44): runs the 6 Suggested_Prompts, a no-data prompt and the
// observations in both views through the real runners on local Qwen in Ollama, several times, scores every output
// with fixed automatic checks and prints a score per prompt. Ported from the prototype (branch
// prototype/answer-format, commit 70528bb). Exits 1 when any prompt failed a run.
//
//   npm run benchmark -- --runs 5

import type { Period } from "../data.ts";
import { getMasterData, getOpportunitySignals, resolvePriorities, signalGroups } from "../data.ts";
import { answerPrompt } from "./answer.ts";
import { siteShortName } from "./checks.ts";
import type { AssistantAnswer, ObservationsReply, ObservationsRequest } from "./contract.ts";
import { SUGGESTED_PROMPTS } from "./contract.ts";
import { MAX_OBSERVATIONS } from "./context.ts";
import type { Chat } from "./ollama.ts";
import { MODEL, NUM_CTX, ollamaChat, ollamaGpuCheck } from "./ollama.ts";
import { generateObservations } from "./observations.ts";
import { ANSWER_TIMEOUT_MS, OBSERVATIONS_TIMEOUT_MS } from "./route.ts";

type View = ObservationsRequest["view"];

const runsAt = process.argv.indexOf("--runs");
const RUNS = runsAt > 0 ? Number(process.argv[runsAt + 1]) : 5;
if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error("--runs takes a whole number of at least 1.");

const CUSTOMER_ID = "CUST001";
const PERIOD: Period = "2025";
// Not in the workbook: checks the reply when no tool covers the question.
const NO_DATA_PROMPT = "What did the service cost us in euros last year?";
const PROMPTS: { prompt: string; view: View }[] = [
  { prompt: SUGGESTED_PROMPTS[0], view: "KAM" },
  { prompt: SUGGESTED_PROMPTS[1], view: "KAM" },
  { prompt: SUGGESTED_PROMPTS[2], view: "KAM" },
  { prompt: SUGGESTED_PROMPTS[3], view: "Customer" },
  { prompt: SUGGESTED_PROMPTS[4], view: "Customer" },
  { prompt: SUGGESTED_PROMPTS[5], view: "KAM" },
  { prompt: NO_DATA_PROMPT, view: "Customer" },
];

// ---------------------------------------------------------------- ground truth

const master = getMasterData().data;
const customerName = master.customers.find((c) => c.customer_id === CUSTOMER_ID)!.customer_name;
const sites = master.sites.filter((s) => s.customer_id === CUSTOMER_ID);
const city = (id: string) => siteShortName(sites.find((s) => s.site_id === id)!.site_name, customerName);
const allCities = sites.map((s) => city(s.site_id));
const groups = { KAM: signalGroups({ customer_id: CUSTOMER_ID, view: "KAM" }), Customer: signalGroups({ customer_id: CUSTOMER_ID, view: "Customer" }) };
const signalCities = (view: View, id: string) => groups[view].find((g) => g.signal_id === id)?.results.map((r) => city(r.site_id)) ?? [];
const firedCities = (view: View) => [...new Set(groups[view].flatMap((g) => g.results.map((r) => city(r.site_id))))];
const ALLOCATION = signalCities("KAM", "garment_allocation_above_peers");
const WASHES = signalCities("KAM", "washes_per_garment_above_peers");
const definitionNumbers = new Set(getOpportunitySignals().catalogue.flatMap((e) => [...e.definition.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])));

const named = (text: string) => allCities.filter((c) => new RegExp(`(^|[^\\p{L}])${c}([^\\p{L}]|$)`, "u").test(text));
// Rule 7: a signal flags a Site for discussion, it is not proof of a problem.
const BANNED = /\b(issues?|problems?|inefficien\w*|overuse|poor|failing|proves?)\b/i;
const EM_DASH = /—/;

/** Unmatched numbers, minus thresholds quoted from the signal definitions (a known false positive of the check). */
const realUnmatched = (u: string[]) => u.filter((n) => !definitionNumbers.has(n.replace(/,/g, "")));

// ---------------------------------------------------------------- what one run did

/** The tools the model called and whether the server sent its one retry, read from the chat requests and replies. */
interface Trace {
  tools: string[];
  retried: boolean;
}

function traced(chat: Chat): { chat: Chat; trace: Trace } {
  const trace: Trace = { tools: [], retried: false };
  return {
    trace,
    chat: async (request, signal) => {
      const last = request.messages.at(-1);
      if (last?.role === "user" && /^Your (answer|observations) break/.test(last.content)) trace.retried = true;
      const reply = await chat(request, signal);
      trace.tools.push(...(reply.message.tool_calls ?? []).map((c) => c.function.name));
      return reply;
    },
  };
}

// ---------------------------------------------------------------- scoring

type Check = { name: string; pass: boolean };
type Score = { checks: Check[]; pass: boolean; notes: string[] };
type Scored = Score & { id: string; seconds: number };

const score = (checks: Check[], notes: string[]): Score => ({ checks, pass: checks.every((c) => c.pass), notes });

function scoreAnswer(i: number, r: AssistantAnswer, trace: Trace): Score {
  const text = r.answer;
  const notes: string[] = [];
  const unmatched = realUnmatched(r.unmatched_numbers);
  if (unmatched.length) notes.push(`unmatched: ${unmatched.join(", ")}`);
  if (trace.retried) notes.push("retried once");
  const common: Check[] = [
    { name: "no unmatched numbers", pass: unmatched.length === 0 },
    { name: "no rule 7 words", pass: !BANNED.test(text) },
    { name: "no em dash", pass: !EM_DASH.test(text) },
  ];
  const n = named(text);
  // The overview and set_priorities carry the signal groups too, so any of the three gives the model the signals.
  const hadSignals = trace.tools.some((t) => ["get_signal_groups", "get_overview", "set_priorities"].includes(t));
  let specific: Check[] = [];
  if (i === 1) {
    specific = [
      { name: "fetched figures", pass: r.sources.length > 0 },
      { name: "water saved names its baseline", pass: /local laundry/i.test(text) && /water saved/i.test(text) },
    ];
  } else if (i === 2) {
    const p = r.priority_change?.priorities ?? [];
    specific = [
      { name: "priorities set water, emissions first", pass: p[0] === "water" && p[1] === "emissions" },
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
    const wrong = n.filter((c) => !firedCities("Customer").includes(c));
    if (wrong.length) notes.push(`Sites not in any fired signal: ${wrong.join(", ")}`);
    specific = [
      { name: "had the signal groups", pass: hadSignals },
      { name: "names Sites from the top signal", pass: signalCities("Customer", "washes_per_garment_above_peers").some((c) => n.includes(c)) },
      { name: "names only fired Sites", pass: wrong.length === 0 },
      { name: "lever owners shown (text or signal groups)", pass: /\b(owner|owned)\b/i.test(text) || (r.signal_groups.length > 0 && r.signal_groups.every((g) => !!g.lever_owner)) },
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
  return score([...specific, ...common], notes);
}

function scoreObservations(r: ObservationsReply, trace: Trace): Score {
  const notes: string[] = [];
  const obs = r.observations;
  const unmatched = obs.flatMap((o) => realUnmatched(o.unmatched_numbers));
  const banned = obs.filter((o) => BANNED.test(o.text));
  if (trace.retried) notes.push("retried once");
  if (unmatched.length) notes.push(`unmatched: ${unmatched.join(", ")}`);
  if (banned.length) notes.push(`rule 7: ${banned.map((o) => o.text).join(" | ")}`);
  // The server owns the tags (#43), so the prototype's tag checks pass by construction and are left out.
  return score(
    [
      { name: `1 to ${MAX_OBSERVATIONS} observations`, pass: obs.length >= 1 && obs.length <= MAX_OBSERVATIONS },
      { name: "no unmatched numbers", pass: unmatched.length === 0 },
      { name: "no rule 7 words", pass: banned.length === 0 },
      { name: "at most 40 words each", pass: obs.every((o) => o.text.split(/\s+/).length <= 40) },
      { name: "no em dash", pass: obs.every((o) => !EM_DASH.test(o.text)) },
    ],
    notes,
  );
}

// ---------------------------------------------------------------- run

const ollama = ollamaChat();
const priorities = resolvePriorities(CUSTOMER_ID, undefined);
const base = (view: View): ObservationsRequest => ({ customer_id: CUSTOMER_ID, period: PERIOD, view, priorities });

/** One scored item, timed and with its route's time limit. A failure scores as one failed check. */
async function item<R>(id: string, limitMs: number, run: (chat: Chat, signal: AbortSignal) => Promise<R>, scoreOf: (r: R, trace: Trace) => Score): Promise<Scored> {
  const { chat, trace } = traced(ollama);
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  try {
    const r = await run(chat, AbortSignal.timeout(limitMs));
    return { id, seconds: seconds(), ...scoreOf(r, trace) };
  } catch (e) {
    return { id, seconds: seconds(), ...score([{ name: "ran without error", pass: false }], [String(e)]) };
  }
}

const labels: Record<string, string> = Object.fromEntries(PROMPTS.map((p, i) => [`P${i + 1}`, `${i + 1}. ${p.prompt} (${p.view})`]));
labels["Obs KAM"] = "Observations, KAM view";
labels["Obs Customer"] = "Observations, Customer view";

console.log(`Benchmark: ${MODEL}, num_ctx ${NUM_CTX}, ${RUNS} runs, ${customerName} ${PERIOD}.`);
const scored: Scored[][] = [];
const started = Date.now();
for (let run = 1; run <= RUNS; run++) {
  const row: Scored[] = [];
  for (const [k, p] of PROMPTS.entries()) {
    const request = { ...base(p.view), prompt: p.prompt };
    row.push(await item(`P${k + 1}`, ANSWER_TIMEOUT_MS, (chat, signal) => answerPrompt(request, { chat, signal }), (r, t) => scoreAnswer(k + 1, r, t)));
  }
  for (const view of ["KAM", "Customer"] as const) {
    row.push(await item(`Obs ${view}`, OBSERVATIONS_TIMEOUT_MS, (chat, signal) => generateObservations(base(view), { chat, signal }), scoreObservations));
  }
  // Warns when part of the model is on the CPU, which makes every time below several times longer.
  if (run === 1) await ollamaGpuCheck()();
  scored.push(row);
  console.log(`run ${run}/${RUNS}: ${row.map((s) => `${s.id} ${s.pass ? "pass" : "FAIL"}`).join(", ")}`);
}

// ---------------------------------------------------------------- report

const ids = scored[0].map((s) => s.id);
const all = (id: string) => scored.map((row) => row.find((s) => s.id === id)!);
const times = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `median ${s[Math.floor(s.length / 2)]} s, max ${s[s.length - 1]} s`;
};

console.log(`\nScore per prompt (runs fully passed), ${Math.round((Date.now() - started) / 1000)} s total:\n`);
for (const id of ids) {
  const runs = all(id);
  console.log(`${runs.filter((s) => s.pass).length}/${RUNS}  ${labels[id]}  (${times(runs.map((s) => s.seconds))})`);
}
for (const id of ids) {
  const runs = all(id);
  if (runs.every((s) => s.pass)) continue;
  console.log(`\n${labels[id]}`);
  for (const name of [...new Set(runs.flatMap((s) => s.checks.map((c) => c.name)))]) {
    const got = runs.flatMap((s) => s.checks.filter((c) => c.name === name));
    console.log(`  ${got.filter((c) => c.pass).length}/${got.length}  ${name}`);
  }
  runs.forEach((s, r) => s.notes.forEach((n) => console.log(`  run ${r + 1}: ${n}`)));
}
const failed = ids.filter((id) => !all(id).every((s) => s.pass));
console.log(failed.length ? `\nFailed: ${failed.map((id) => labels[id]).join("; ")}` : "\nEvery prompt passed every run.");
process.exitCode = failed.length ? 1 : 0;
