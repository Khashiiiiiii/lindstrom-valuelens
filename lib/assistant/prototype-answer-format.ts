// PROTOTYPE, throwaway. Branch prototype/answer-format only, never merged.
// Answers "Answer and observation format" (#18): runs a draft system prompt, the 4 tools from "Assistant tool set"
// (#17) and the observations call against NorthStar Foods Group on local Qwen in Ollama, and writes what came back
// to lib/assistant/prototype-answer-format.out.md. The Claude version is commit 891f5f6 on this branch.
//
//   node lib/assistant/prototype-answer-format.ts             # 6 Suggested_Prompts + observations in both views
//   node lib/assistant/prototype-answer-format.ts --only 3    # one prompt, no observations
//   node lib/assistant/prototype-answer-format.ts --think     # turn on Qwen's thinking mode
//   node lib/assistant/prototype-answer-format.ts --dry       # print the system prompts only

import { writeFileSync } from "node:fs";

import type { KpiAnswer, KpiQuery, KpiResult, Period } from "../data.ts";
import { firstScreen, getMasterData, getOpportunitySignals, listKpis, proposedNextSteps, runKpi, signalGroups } from "../data.ts";
import { resolvePriorities } from "../data/customer-priorities.ts";
import type { SignalGroup } from "../data/opportunity-signals.ts";

type View = KpiQuery["view"];

const OLLAMA = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3:4b-q8_0";
const NUM_CTX = 16384;
const THINK = process.argv.includes("--think");
const CUSTOMER_ID = "CUST001";
const PERIOD: Period = "2025";
const MAX_ROUNDS = 3;
const MAX_CALLS = 8;
const MAX_OBSERVATIONS = 3;

const PRIORITY_NAMES: Record<string, string> = {
  water: "Water",
  emissions: "Emissions",
  circularity: "Circularity",
  service_reliability: "Service reliability",
  garment_utilisation: "Garment utilisation",
  traceability: "Traceability",
  improvement: "Improvement",
};

const PROMPTS: { view: View; prompt: string; expected: string }[] = [
  { view: "KAM", prompt: "Show the value created for NorthStar Foods Group in 2025.", expected: "Executive value summary" },
  { view: "KAM", prompt: "Focus on water and emissions for the food-industry sites.", expected: "Priority-personalized dashboard" },
  { view: "KAM", prompt: "Which sites have the greatest textile-allocation optimization potential?", expected: "Outlier analysis" },
  { view: "Customer", prompt: "How can we improve our performance next year?", expected: "Recommendations and steering questions" },
  { view: "Customer", prompt: "Compare our circular service with local laundry.", expected: "Baseline comparison" },
  { view: "KAM", prompt: "Prepare five discussion points for the annual steering committee.", expected: "Customer-ready narrative" },
];

// ---------------------------------------------------------------- request context

interface Request {
  customer_id: string;
  site_id?: string;
  period: Period;
  view: View;
  priorities?: string[];
}

const master = getMasterData().data;
const customer = master.customers.find((c) => c.customer_id === CUSTOMER_ID)!;
const sites = master.sites.filter((s) => s.customer_id === CUSTOMER_ID);
const siteName = (id: string) => sites.find((s) => s.site_id === id)?.site_name ?? id;

function contextBlock(req: Request): string {
  const order = resolvePriorities(req.customer_id, req.priorities).map((p) => PRIORITY_NAMES[p]);
  return [
    `Customer: ${customer.customer_name} (${customer.customer_id}), industry ${customer.industry}, ${sites.length} Sites.`,
    `Reader: ${req.view === "KAM" ? "the KAM, the Lindström key account manager who prepares the review" : "the Customer decision-maker, who receives the review"}.`,
    `Period: ${req.period}. Site filter: ${req.site_id ? siteName(req.site_id) : "none, the whole Customer"}.`,
    `Customer priorities, in order: ${order.join(", ")}.`,
    `Sites (site_id: name, site type):`,
    ...sites.map((s) => `- ${s.site_id}: ${s.site_name}, ${s.site_type}`),
  ].join("\n");
}

// ---------------------------------------------------------------- the draft system prompts (the thing under test)
// Kept short and firm for a 4B model. Data status is left to the dashboard, which shows it next to every source.

const RULES = `
Rules
1. Only write numbers that appear in a tool result. Never calculate, add, average or convert a number. The one exception: you may write a share as a percent.
2. Give each figure its unit and what it covers: which Site (or all Sites) and which period.
3. For water saved, energy saved or emissions saved, always name the baseline with the result's baseline_label.
4. If a result has value null, write "not evaluated" and its not_evaluated_reason. If a result is withheld, write "not available in this view".
5. If no tool result covers what is asked (for example cost, euros, prices, satisfaction, hygiene or safety), write "The data does not hold <that>." Never estimate.
6. If results you used have caveats, end with one line "Caveats: ..." giving each caveat once.
7. An opportunity signal flags a Site for discussion. It is not proof of a problem. Give each lever with its owner (Customer, Lindström or Joint). A proposed next step is to be agreed in the meeting; never call it agreed.
8. Use Site names, not site ids. Say Site, service request and service cycle (not location, complaint or delivery).
9. Plain words, short sentences, no em dashes, no headings, no tables.`;

function answerSystem(req: Request): string {
  return `You are the ValueLens assistant in Lindström's Customer Value & Sustainability Review dashboard. Answer one prompt. There is no earlier conversation and you cannot ask a question back.

${contextBlock(req)}

How to work
- Get every figure from the tools. You may call several tools at once. You have at most ${MAX_ROUNDS} rounds of tool calls.
- Call set_priorities only when the prompt asks to focus on or put first some topics. Then say in the answer that the priorities changed.
- Keep the answer under 180 words, unless the prompt asks for a number of points.
${RULES}`;
}

function observationsSystem(req: Request): string {
  return `You write AI observations for Lindström's Customer Value & Sustainability Review dashboard. You get the first screen and the fired opportunity signal groups as JSON.

${contextBlock(req)}

What to write
- At most ${MAX_OBSERVATIONS} observations. Fewer if the results do not give ${MAX_OBSERVATIONS} different points. Order them by the Customer priorities, then by size of gap.
- Each observation is 1 or 2 sentences, at most 40 words, and makes one point: a figure, a comparison between Sites, or a fired signal group.
- Say only what the results say. No trends, causes or forecasts they do not state.
- For each observation, list the kpi_ids and signal_ids it uses.
- Do not repeat a figure in two observations.
${RULES}

Reply with JSON only: {"observations": [{"text": "...", "kpi_ids": ["..."], "signal_ids": ["..."]}]}`;
}

// ---------------------------------------------------------------- tools

function compact(answer: KpiAnswer): unknown {
  if ("withheld" in answer) return answer;
  const r: KpiResult = answer;
  return {
    kpi_id: r.kpi_id,
    name: r.name,
    value: r.value,
    unit: r.unit,
    volume: r.volume,
    period: r.period,
    site: r.scope.site_id ? siteName(r.scope.site_id) : "all Sites",
    baseline_id: r.baseline_id,
    data_status: r.data_status,
    not_evaluated_reason: r.not_evaluated_reason,
    caveats: r.caveats,
    ...(r.breakdown ? { breakdown: r.breakdown } : {}),
    ...(r.detail?.kind === "handprint" ? { baseline_label: r.detail.baseline_label } : {}),
    ...(r.detail?.kind === "account_health" ? { rating: r.detail.rating } : {}),
    ...(r.detail?.kind === "period_comparison" ? { comparison: r.detail.comparison } : {}),
  };
}

const PERIODS = ["2025", "2025-H1", "2025-H2", ...Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`)];
const BASELINES = ["B_LOCAL", "B_HOME", "B_INHOUSE"];
const UNITS = ["total", "per_active_wearer"];

interface OllamaTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

function tools(view: View): OllamaTool[] {
  const listing = listKpis(view);
  const areas = [...new Set(listing.map((k) => k.evidence_area))];
  const kpiText = areas
    .map((a) => `${a}: ${listing.filter((k) => k.evidence_area === a).map((k) => `${k.id} (${k.name})`).join("; ")}`)
    .join("\n");
  const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): OllamaTool => ({
    type: "function",
    function: { name, description, parameters: { type: "object", properties, required } },
  });
  const period = { type: "string", enum: PERIODS, description: "Leave out for the dashboard's period." };
  return [
    fn(
      "get_overview",
      "The dashboard's first screen for the whole Customer: the 9 common tiles with their KPI results, the Site count, Optimisation potential (fired signal results and groups) and up to 3 priority blocks with their KPI results.",
      { period },
    ),
    fn(
      "get_kpis",
      `Runs KPIs for one scope: one Site or the whole Customer, one period, one baseline and one unit. To compare Sites, call it once per Site. Period comparisons are the improvement_* KPIs.\n\nKPIs by evidence area:\n${kpiText}`,
      {
        kpi_ids: { type: "array", items: { type: "string", enum: listing.map((k) => k.id) } },
        site_id: { type: "string", enum: sites.map((s) => s.site_id), description: "One Site. Leave site_id out to get all Sites together." },
        period,
        baseline_id: { type: "string", enum: BASELINES, description: "Handprint KPIs only. B_LOCAL outsourced local laundry (default), B_HOME home washing, B_INHOUSE in-house laundry." },
        unit: { type: "string", enum: UNITS, description: "Footprint KPIs only. Default total." },
      },
      ["kpi_ids"],
    ),
    fn(
      "get_signal_groups",
      "The fired opportunity signals for 2025, grouped by signal and ranked by the Customer priorities, then by largest gap. Each group gives its lever, lever owner and the Sites it fired on with their gaps. Also gives the top 3 proposed next steps.",
      {},
    ),
    fn(
      "set_priorities",
      "Moves these Customer priorities to the top of the dashboard, in this order. The others follow in their current order. Returns the new order.",
      { priorities: { type: "array", items: { type: "string", enum: Object.values(PRIORITY_NAMES) } } },
      ["priorities"],
    ),
  ];
}

interface RunState {
  req: Request;
  sources: KpiAnswer[];
  signal_groups: SignalGroup[];
  priority_change: { priorities: string[] } | null;
  extraNumbers: number[];
  log: string[];
}

function addSources(state: RunState, answers: KpiAnswer[]): void {
  const key = (a: KpiAnswer) => ("withheld" in a ? `${a.kpi_id}|withheld` : `${a.kpi_id}|${a.scope.site_id ?? ""}|${a.period}|${a.baseline_id ?? ""}`);
  const seen = new Set(state.sources.map(key));
  for (const a of answers) if (!seen.has(key(a))) state.sources.push(a), seen.add(key(a));
}

/** Without strict tool schemas, the server checks every argument and fails the call with a message the model can read. */
function check(value: unknown, allowed: string[], field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${field} must be one of ${allowed.join(", ")}; got ${JSON.stringify(value)}.`);
  return value;
}

function runTool(state: RunState, name: string, input: any): unknown {
  const { req } = state;
  const priorities = state.priority_change?.priorities ?? req.priorities;
  if (name === "get_overview") {
    const period = (check(input.period, PERIODS, "period") ?? req.period) as Period;
    const fs = firstScreen({ customer_id: req.customer_id, view: req.view, period, priorities });
    const answers = [...fs.tiles.flatMap((t) => t.answers), ...fs.priority_blocks.flatMap((b) => b.answers)];
    if (fs.kam_additions) answers.push(fs.kam_additions.account_health);
    addSources(state, answers);
    state.extraNumbers.push(fs.site_count, fs.optimisation_potential.fired_count, fs.optimisation_potential.signal_count);
    return {
      period: fs.period,
      priorities: fs.priority_ids.map((p) => PRIORITY_NAMES[p]),
      site_count: fs.site_count,
      tiles: fs.tiles.map((t) => ({ name: t.name, results: t.answers.map(compact) })),
      optimisation_potential: fs.optimisation_potential,
      priority_blocks: fs.priority_blocks.map((b) => ({
        priority: PRIORITY_NAMES[b.priority_id],
        results: b.answers.map(compact),
        signal_group: b.signal_group_signal_id,
      })),
      ...(fs.kam_additions ? { account_health: compact(fs.kam_additions.account_health) } : {}),
    };
  }
  if (name === "get_kpis") {
    const known = listKpis(req.view).map((k) => k.id);
    const ids: unknown[] = Array.isArray(input.kpi_ids) ? input.kpi_ids : typeof input.kpi_ids === "string" ? [input.kpi_ids] : [];
    if (ids.length === 0) throw new Error("kpi_ids must be a non-empty list of KPI ids.");
    const bad = ids.filter((id) => typeof id !== "string" || !known.includes(id));
    if (bad.length) throw new Error(`Unknown KPI ids in this view: ${bad.join(", ")}. Use ids from the tool description.`);
    const query: KpiQuery = {
      scope: { customer_id: req.customer_id, site_id: check(input.site_id, sites.map((s) => s.site_id), "site_id") ?? req.site_id },
      period: (check(input.period, PERIODS, "period") ?? req.period) as Period,
      view: req.view,
      baseline_id: check(input.baseline_id, BASELINES, "baseline_id") as KpiQuery["baseline_id"],
      unit: check(input.unit, UNITS, "unit") as KpiQuery["unit"],
    };
    const answers = (ids as string[]).map((id) => runKpi(id, query));
    addSources(state, answers);
    return answers.map(compact);
  }
  if (name === "get_signal_groups") {
    const groups = signalGroups({ customer_id: req.customer_id, view: req.view, priorities });
    state.signal_groups = groups;
    for (const g of groups) state.extraNumbers.push(g.fired_count, g.largest_gap, g.largest_gap * 100, ...g.results.flatMap((r) => [r.gap, r.gap * 100]));
    const catalogue = getOpportunitySignals().catalogue;
    return {
      period: "2025",
      gap_meaning: "A gap is how far the Site is above the median of the Customer's other Sites, as a share: a gap of 0.25 would mean 25% above.",
      groups: groups.map((g) => {
        const entry = catalogue.find((e) => e.id === g.signal_id)!;
        return {
          rank: g.rank,
          signal_id: g.signal_id,
          signal_name: entry.name,
          what_it_flags: entry.definition,
          lever: g.lever,
          lever_owner: g.lever_owner,
          matched_priority: g.matched_priority_id ? PRIORITY_NAMES[g.matched_priority_id] : null,
          fired_count: g.fired_count,
          results: g.results.map((r) => ({ site_name: siteName(r.site_id), product_id: r.product_id, gap: r.gap })),
        };
      }),
      proposed_next_steps: proposedNextSteps({ customer_id: req.customer_id, view: req.view, priorities }).map((s) => ({
        ...s,
        results: s.results.map((r) => ({ ...r, site_name: siteName(r.site_id) })),
      })),
    };
  }
  if (name === "set_priorities") {
    const all = Object.values(PRIORITY_NAMES);
    const asked: unknown[] = Array.isArray(input.priorities) ? input.priorities : [];
    const bad = asked.filter((p) => typeof p !== "string" || !all.includes(p));
    if (asked.length === 0 || bad.length) throw new Error(`priorities must be a list of: ${all.join(", ")}.`);
    const current = resolvePriorities(req.customer_id, priorities).map((p) => PRIORITY_NAMES[p]);
    const rest = [...current, ...all.filter((p) => !current.includes(p))].filter((p) => !asked.includes(p));
    state.priority_change = { priorities: [...(asked as string[]), ...rest] };
    return { priorities: state.priority_change.priorities };
  }
  throw new Error(`Unknown tool ${name}.`);
}

// ---------------------------------------------------------------- unmatched numbers (draft matching rule)

/**
 * Every number in the text that matches no value in the sources. A written number matches a value when it equals the
 * value rounded to the places the text writes; a share also matches as a percent. Years, periods, ids and list
 * markers are skipped.
 */
function unmatchedNumbers(text: string, sources: KpiAnswer[], extra: number[]): string[] {
  const known: number[] = [...extra];
  for (const s of sources) {
    if ("withheld" in s) continue;
    for (const n of [s.value, s.volume, ...(s.breakdown ?? []).map((b) => b.value)]) if (typeof n === "number") known.push(n, n * 100);
    // Numbers inside the result's own words (unit, name, caveats) are quotes, not figures.
    for (const t of [s.unit, s.name, ...s.caveats]) for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) known.push(Number(m[0]));
    if (s.detail?.kind === "handprint") known.push(s.detail.baseline_amount, s.detail.customer_washed_kg, ...(s.detail.share_of_baseline != null ? [s.detail.share_of_baseline * 100] : []));
  }
  const cleaned = text
    .replace(/\b(CUST|S|L|P|B_)\w*\d+\b/g, " ")
    .replace(/\b20\d\d(-H[12]|-\d\d)?\b/g, " ")
    .replace(/\bH[12]\b/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ");
  const out: string[] = [];
  for (const m of cleaned.matchAll(/-?\d(?:[\d,]|\s(?=\d{3}\b))*(?:\.\d+)?/g)) {
    const raw = m[0].trim().replace(/,$/, "");
    const written = raw.replace(/[,\s]/g, "");
    if (!written || written === "-") continue;
    const n = Math.abs(Number(written));
    const places = written.includes(".") ? written.split(".")[1].length : 0;
    const tol = 0.5 * 10 ** -places + 1e-9;
    if (!known.some((k) => Math.abs(Math.abs(k) - n) <= tol)) out.push(raw);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- model calls

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: any } }[];
  tool_name?: string;
}

interface OllamaReply {
  message: OllamaMessage;
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

async function chat(body: Record<string, unknown>): Promise<OllamaReply> {
  const res = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: false, think: THINK, options: { num_ctx: NUM_CTX, temperature: 0.3 }, ...body }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return (await res.json()) as OllamaReply;
}

const clean = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

async function assistantAnswer(req: Request, prompt: string) {
  const state: RunState = { req, sources: [], signal_groups: [], priority_change: null, extraNumbers: [], log: [] };
  const messages: OllamaMessage[] = [
    { role: "system", content: answerSystem(req) },
    { role: "user", content: prompt },
  ];
  const toolDefs = tools(req.view);
  let calls = 0;
  const tokens = { prompt: 0, output: 0, largestPrompt: 0 };
  const started = Date.now();
  for (let round = 0; ; round++) {
    const final = round >= MAX_ROUNDS || calls >= MAX_CALLS;
    if (final) messages.push({ role: "user", content: "No more tool calls. Write the answer now from the results you have." });
    const reply = await chat({ messages, ...(final ? {} : { tools: toolDefs }) });
    tokens.prompt += reply.prompt_eval_count ?? 0;
    tokens.output += reply.eval_count ?? 0;
    tokens.largestPrompt = Math.max(tokens.largestPrompt, reply.prompt_eval_count ?? 0);
    messages.push(reply.message);
    const uses = (reply.message.tool_calls ?? []).slice(0, MAX_CALLS - calls);
    if (uses.length === 0) {
      const answer = clean(reply.message.content ?? "");
      return {
        answer: answer || `(model_error: no text, done_reason ${reply.done_reason})`,
        sources: state.sources,
        signal_groups: state.signal_groups,
        priority_change: state.priority_change,
        unmatched_numbers: unmatchedNumbers(answer, state.sources, state.extraNumbers),
        log: state.log,
        meta: { rounds: round + 1, calls, seconds: Math.round((Date.now() - started) / 1000), tokens },
      };
    }
    for (const u of uses) {
      calls++;
      const args = typeof u.function.arguments === "string" ? JSON.parse(u.function.arguments) : u.function.arguments ?? {};
      let content: string;
      try {
        content = JSON.stringify(runTool(state, u.function.name, args));
        state.log.push(`round ${round + 1}: ${u.function.name}(${JSON.stringify(args)})`);
      } catch (e) {
        content = `Error: ${(e as Error).message}`;
        state.log.push(`round ${round + 1}: ${u.function.name}(${JSON.stringify(args)}) FAILED ${(e as Error).message}`);
      }
      messages.push({ role: "tool", tool_name: u.function.name, content });
    }
  }
}

const OBSERVATION_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kpi_ids: { type: "array", items: { type: "string" } },
          signal_ids: { type: "array", items: { type: "string" } },
        },
        required: ["text", "kpi_ids", "signal_ids"],
      },
    },
  },
  required: ["observations"],
};

async function observations(req: Request) {
  const state: RunState = { req, sources: [], signal_groups: [], priority_change: null, extraNumbers: [], log: [] };
  const input = { first_screen: runTool(state, "get_overview", {}), signal_groups: runTool(state, "get_signal_groups", {}) };
  const started = Date.now();
  const reply = await chat({
    messages: [
      { role: "system", content: observationsSystem(req) },
      { role: "user", content: JSON.stringify(input) },
    ],
    format: OBSERVATION_SCHEMA,
  });
  const parsed = JSON.parse(clean(reply.message.content)) as { observations: { text: string; kpi_ids: string[]; signal_ids: string[] }[] };
  return {
    observations: parsed.observations.slice(0, MAX_OBSERVATIONS).map((o) => {
      const sources = state.sources.filter((s) => o.kpi_ids.includes(s.kpi_id));
      const signal_groups = state.signal_groups.filter((g) => o.signal_ids.includes(g.signal_id));
      const extra = [sites.length, ...signal_groups.flatMap((g) => [g.fired_count, g.largest_gap, g.largest_gap * 100, ...g.results.flatMap((r) => [r.gap, r.gap * 100])])];
      return { ...o, sources, signal_groups, unmatched_numbers: unmatchedNumbers(o.text, sources, extra) };
    }),
    returned: parsed.observations.length,
    meta: { seconds: Math.round((Date.now() - started) / 1000), prompt_tokens: reply.prompt_eval_count },
  };
}

// ---------------------------------------------------------------- run

function sourceLine(s: KpiAnswer): string {
  if ("withheld" in s) return `- ${s.kpi_id}: KAM view only`;
  return `- ${s.kpi_id} | ${s.scope.site_id ?? "Customer"} | ${s.period}${s.baseline_id ? ` | ${s.baseline_id}` : ""} | ${s.value ?? "not evaluated"} ${s.unit} | ${s.data_status}${s.caveats.length ? ` | caveats: ${s.caveats.join(" / ")}` : ""}`;
}

async function main() {
  const base = (view: View): Request => ({ customer_id: CUSTOMER_ID, period: PERIOD, view });
  if (process.argv.includes("--dry")) {
    console.log(answerSystem(base("KAM")), "\n\n=====\n\n", observationsSystem(base("Customer")));
    return;
  }
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt > 0 ? Number(process.argv[onlyAt + 1]) : null;
  const out: string[] = [
    `# Prototype run: Answer and observation format`,
    ``,
    `Model \`${MODEL}\` in Ollama, num_ctx ${NUM_CTX}, thinking ${THINK ? "on" : "off"}, temperature 0.3, ${new Date().toISOString()}. NorthStar Foods Group, period ${PERIOD}, no Site filter, default priorities (Water, Service reliability, Emissions).`,
    ``,
  ];
  for (const [i, p] of PROMPTS.entries()) {
    if (only !== null && only !== i + 1) continue;
    console.error(`prompt ${i + 1}...`);
    const r = await assistantAnswer(base(p.view), p.prompt);
    out.push(
      `## ${i + 1}. ${p.prompt}`,
      ``,
      `${p.view} view. Expected: ${p.expected}. ${r.meta.rounds} rounds, ${r.meta.calls} tool calls, ${r.meta.seconds} s, largest prompt ${r.meta.tokens.largestPrompt} tokens, ${r.meta.tokens.output} output tokens.`,
      ``,
      `**Answer**`,
      ``,
      r.answer.split("\n").map((l) => `> ${l}`).join("\n"),
      ``,
      `**unmatched_numbers:** ${r.unmatched_numbers.length ? r.unmatched_numbers.join(", ") : "none"}`,
      ``,
      `**priority_change:** ${r.priority_change ? r.priority_change.priorities.join(", ") : "none"}`,
      ``,
      `<details><summary>Tool calls and ${r.sources.length} sources</summary>`,
      ``,
      ...r.log.map((l) => `- ${l}`),
      ``,
      ...r.sources.map(sourceLine),
      ``,
      `</details>`,
      ``,
    );
  }
  if (only === null) {
    for (const view of ["KAM", "Customer"] as View[]) {
      console.error(`observations ${view}...`);
      const r = await observations(base(view));
      out.push(`## Generate observations, ${view} view`, ``, `${r.meta.seconds} s, prompt ${r.meta.prompt_tokens} tokens, ${r.returned} returned.`, ``);
      for (const [i, o] of r.observations.entries()) {
        out.push(
          `${i + 1}. ${o.text}`,
          `   - kpi_ids: ${o.kpi_ids.join(", ") || "none"}; signal_ids: ${o.signal_ids.join(", ") || "none"}; unmatched_numbers: ${o.unmatched_numbers.join(", ") || "none"}`,
        );
      }
      out.push(``);
    }
  }
  const file = new URL(`./prototype-answer-format${THINK ? ".think" : ""}.out.md`, import.meta.url);
  writeFileSync(file, out.join("\n"));
  console.error(`wrote ${file.pathname}`);
}

await main();
