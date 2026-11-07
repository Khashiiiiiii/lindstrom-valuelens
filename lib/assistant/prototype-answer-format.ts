// PROTOTYPE, throwaway. Branch prototype/answer-format only, never merged.
// Answers "Answer and observation format" (#18): runs a draft system prompt, the 4 tools from "Assistant tool set"
// (#17) and the observations call against NorthStar Foods Group, and writes what came back to
// lib/assistant/prototype-answer-format.out.md.
//
//   node lib/assistant/prototype-answer-format.ts          # 6 Suggested_Prompts + 1 observations click
//   node lib/assistant/prototype-answer-format.ts --dry    # print the system prompts only, no API call

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";

import type { KpiAnswer, KpiQuery, KpiResult, Period } from "../data.ts";
import { firstScreen, getMasterData, listKpis, proposedNextSteps, runKpi, signalGroups } from "../data.ts";
import { resolvePriorities } from "../data/customer-priorities.ts";
import type { SignalGroup } from "../data/opportunity-signals.ts";

type View = KpiQuery["view"];

const MODEL = "claude-opus-5-5";
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

function contextBlock(req: Request): string {
  const order = resolvePriorities(req.customer_id, req.priorities).map((p) => PRIORITY_NAMES[p]);
  return [
    `Customer: ${customer.customer_name} (${customer.customer_id}), industry ${customer.industry}, ${sites.length} Sites.`,
    `View: ${req.view} view. You are answering ${req.view === "KAM" ? "the KAM, who prepares and runs the review" : "the Customer decision-maker, who receives the review"}.`,
    `Period: ${req.period}. Site filter: ${req.site_id ?? "none (whole Customer)"}.`,
    `Customer priorities, in order: ${order.join(", ")}.`,
    `Sites (site_id: name, city, site type):`,
    ...sites.map((s) => `- ${s.site_id}: ${s.site_name}, ${s.city}, ${s.site_type}`),
  ].join("\n");
}

// ---------------------------------------------------------------- the draft system prompts (the thing under test)

const FIGURE_RULES = `
Figures
- Every number you write comes from a tool result you were given in this answer. Never calculate, add, subtract, average or convert a number yourself. The one exception: write a share as a percent (0.912 is 91.2%).
- Keep the precision the result gives, or round to fewer places. Never invent precision.
- Write each figure with its unit and what it covers, for example "on-time service cycles across all 24 Sites in 2025: 91.2%".
- A handprint figure (water saved, energy saved, emissions saved) always names its baseline, for example "1,234 l of water saved vs outsourced local laundry".
- When a result's data_status contains ESTIMATE, write "(estimate)" right after the figure. Do not label plain SYNTHETIC figures: the dashboard shows every source's data status next to the answer.
- When a result has value null, say it was not evaluated and quote its not_evaluated_reason. Never estimate the missing figure.
- When a result is withheld, say that this figure is not available in this view. Say nothing else about it.
- When results you used carry caveats, end with one line that starts "Caveats:" and gives each caveat once, in its own words.

When the data does not hold it
- If no tool result covers what the prompt asks (for example cost, euros, prices, contract terms, satisfaction, hygiene or safety), say "The data does not hold <that thing>." Then, in one sentence, name the closest thing it does hold, if there is one. Never estimate, never give a typical industry figure.

Opportunity signals and next steps
- An opportunity signal flags a Site for discussion because it does worse than this Customer's other Sites. It is not proof of a problem. Say "flags" or "stands out", never "is failing".
- A lever always comes with its owner: the Customer, Lindström or Joint.
- A proposed next step is proposed, to be agreed in the meeting. Never call it agreed and never give it a date.

Words
- Plain words, short sentences, no em dashes. No headings and no tables. A short list is fine when the prompt asks for points or steps.
- Use these terms: Site (not location or branch), service request (not complaint), service cycle (not delivery), allocated garments with no scan activity (not idle or unused garments), handprint and baseline (not savings vs benchmark).
- Refer to a Site by its name, not its site_id.
- Stay under 180 words unless the prompt asks for a set number of points.`;

function answerSystem(req: Request): string {
  return `You are the ValueLens assistant in Lindström's Customer Value & Sustainability Review dashboard. You answer one prompt. There is no earlier conversation and you cannot ask a follow-up question.

${contextBlock(req)}

How to work
- Get every figure through the tools. Call several tools in one round when you can; you have at most ${MAX_ROUNDS} rounds and ${MAX_CALLS} calls.
- Call set_priorities only when the prompt asks to focus on, prioritise or put first some topics. It is the only thing you can change on the dashboard. Say in the answer that you changed the priorities.
- The Site filter and the period are chosen by the dashboard. You may ask a tool for another Site or period, but say which one each figure covers.
${FIGURE_RULES}`;
}

function observationsSystem(req: Request): string {
  return `You write AI observations for Lindström's Customer Value & Sustainability Review dashboard. The user clicked "Generate observations". You are given the first screen and the fired opportunity signal groups the server calculated. You call no tools.

${contextBlock(req)}

What to write
- At most ${MAX_OBSERVATIONS} observations, fewer if the results do not support ${MAX_OBSERVATIONS} distinct ones. Rank them by the Customer priorities, then by size of gap.
- Each observation is 1 or 2 sentences, at most 40 words, and makes one point: a figure, a comparison between Sites, or a fired signal group.
- An observation finds nothing the fixed rules did not. Do not claim a trend, a cause or a forecast the results do not state.
- For each observation, list the kpi_ids and the signal_ids whose results it uses, and nothing else.
${FIGURE_RULES.replace("Stay under 180 words unless the prompt asks for a set number of points.", "Do not repeat the same figure in two observations.")}`;
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
    site: r.scope.site_id ?? null,
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

function tools(view: View): Anthropic.Tool[] {
  const listing = listKpis(view);
  const areas = [...new Set(listing.map((k) => k.evidence_area))];
  const kpiText = areas
    .map((a) => `${a}: ${listing.filter((k) => k.evidence_area === a).map((k) => `${k.id} (${k.name})`).join("; ")}`)
    .join("\n");
  const siteIds = sites.map((s) => s.site_id);
  const scope = {
    site_id: { type: "string", enum: siteIds, description: "One Site. Leave out for the whole Customer, or the dashboard's Site filter." },
    period: { type: "string", enum: PERIODS, description: "Leave out for the dashboard's period." },
  };
  return [
    {
      name: "get_overview",
      description:
        "The dashboard's first screen for the whole Customer: the 9 common tiles with their KPI results, the Site count, Optimisation potential (fired signal results and groups) and up to 3 priority blocks with their KPI results.",
      strict: true,
      input_schema: { type: "object", properties: { period: scope.period }, additionalProperties: false },
    },
    {
      name: "get_kpis",
      description: `Runs KPIs for one scope: one Site or the whole Customer, one period, one baseline and one unit for all of them. To compare Sites, make one call per Site in the same round. Period comparisons are the improvement_* KPIs.\n\nKPIs by evidence area:\n${kpiText}`,
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          kpi_ids: { type: "array", items: { type: "string", enum: listing.map((k) => k.id) }, minItems: 1 },
          ...scope,
          baseline_id: {
            type: "string",
            enum: ["B_LOCAL", "B_HOME", "B_INHOUSE"],
            description: "Handprint KPIs only. B_LOCAL outsourced local laundry (default), B_HOME home washing, B_INHOUSE in-house laundry.",
          },
          unit: { type: "string", enum: ["total", "per_active_wearer"], description: "Footprint KPIs only. Default total." },
        },
        required: ["kpi_ids"],
        additionalProperties: false,
      },
    },
    {
      name: "get_signal_groups",
      description:
        "The fired opportunity signals for 2025, grouped by signal, ranked by the Customer priorities then by largest gap. Each group gives its lever, the lever owner and the Sites (and products) it fired on with their gaps. Also gives the top 3 proposed next steps.",
      strict: true,
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "set_priorities",
      description:
        "Moves these Customer priorities to the top of the dashboard, in this order. The other priorities follow in their current order. Changes the priority blocks the dashboard shows. Returns the new order.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { priorities: { type: "array", items: { type: "string", enum: Object.values(PRIORITY_NAMES) }, minItems: 1 } },
        required: ["priorities"],
        additionalProperties: false,
      },
    },
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

function runTool(state: RunState, name: string, input: any): unknown {
  const { req } = state;
  const priorities = state.priority_change?.priorities ?? req.priorities;
  if (name === "get_overview") {
    const fs = firstScreen({ customer_id: req.customer_id, view: req.view, period: input.period ?? req.period, priorities });
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
    const query: KpiQuery = {
      scope: { customer_id: req.customer_id, site_id: input.site_id ?? req.site_id },
      period: input.period ?? req.period,
      view: req.view,
      baseline_id: input.baseline_id,
      unit: input.unit,
    };
    const answers = (input.kpi_ids as string[]).map((id) => runKpi(id, query));
    addSources(state, answers);
    return answers.map(compact);
  }
  if (name === "get_signal_groups") {
    const groups = signalGroups({ customer_id: req.customer_id, view: req.view, priorities });
    state.signal_groups = groups;
    for (const g of groups) state.extraNumbers.push(g.fired_count, g.largest_gap, ...g.results.map((r) => r.gap));
    const siteName = (id: string) => sites.find((s) => s.site_id === id)?.site_name ?? id;
    return {
      period: "2025",
      groups: groups.map((g) => ({ ...g, results: g.results.map((r) => ({ ...r, site_name: siteName(r.site_id) })) })),
      proposed_next_steps: proposedNextSteps({ customer_id: req.customer_id, view: req.view, priorities }),
    };
  }
  if (name === "set_priorities") {
    const current = resolvePriorities(req.customer_id, priorities).map((p) => PRIORITY_NAMES[p]);
    const all = Object.values(PRIORITY_NAMES);
    const rest = [...current, ...all.filter((p) => !current.includes(p))].filter((p) => !input.priorities.includes(p));
    state.priority_change = { priorities: [...input.priorities, ...rest] };
    return { priorities: state.priority_change.priorities };
  }
  throw new Error(`Unknown tool ${name}`);
}

// ---------------------------------------------------------------- unmatched numbers (draft matching rule)

/** Every number in the text that matches no value in the sources, at the precision the text writes it. */
function unmatchedNumbers(text: string, sources: KpiAnswer[], extra: number[]): string[] {
  const known: number[] = [...extra];
  for (const s of sources) {
    if ("withheld" in s) continue;
    for (const n of [s.value, s.volume, ...(s.breakdown ?? []).map((b) => b.value)]) if (typeof n === "number") known.push(n, n * 100);
    if (s.detail?.kind === "handprint") known.push(s.detail.baseline_amount, s.detail.customer_washed_kg, ...(s.detail.share_of_baseline != null ? [s.detail.share_of_baseline * 100] : []));
  }
  const cleaned = text
    .replace(/\b(CUST|S|L|P|B_)\w*\d+\b/g, " ") // ids
    .replace(/\b20\d\d(-H[12]|-\d\d)?\b/g, " ") // years and periods
    .replace(/\bH[12]\b/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " "); // list markers
  const out: string[] = [];
  for (const m of cleaned.matchAll(/-?\d[\d,\s]*(?:\.\d+)?/g)) {
    const raw = m[0].trim().replace(/[\s,]+$/, "");
    const written = raw.replace(/[,\s]/g, "");
    if (!written || written === "-") continue;
    const n = Number(written);
    const places = written.includes(".") ? written.split(".")[1].length : 0;
    const tol = 0.5 * 10 ** -places + 1e-9;
    // A whole number also matches a value it rounds (91 for 91.2), and "1.2 million"-style is not allowed.
    if (!known.some((k) => Math.abs(Math.abs(k) - Math.abs(n)) <= Math.max(tol, places === 0 ? 0.5 : tol))) out.push(raw);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- model calls

const client = new Anthropic();

async function create(params: Record<string, unknown>): Promise<Anthropic.Beta.BetaMessage> {
  return (await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
  } as any)) as Anthropic.Beta.BetaMessage;
}

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

async function assistantAnswer(req: Request, prompt: string) {
  const state: RunState = { req, sources: [], signal_groups: [], priority_change: null, extraNumbers: [], log: [] };
  const system = answerSystem(req);
  const toolDefs = tools(req.view);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let calls = 0;
  let usage = { input: 0, output: 0 };
  const started = Date.now();
  for (let round = 0; ; round++) {
    const final = round >= MAX_ROUNDS || calls >= MAX_CALLS;
    const msg = await create({ system, tools: toolDefs, messages, ...(final ? { tool_choice: { type: "none" } } : {}) });
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    messages.push({ role: "assistant", content: msg.content as any });
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || uses.length === 0) {
      const answer = textOf(msg);
      return {
        answer: answer || `(model_error: no text, stop_reason ${msg.stop_reason})`,
        sources: state.sources,
        signal_groups: state.signal_groups,
        priority_change: state.priority_change,
        unmatched_numbers: unmatchedNumbers(answer, state.sources, state.extraNumbers),
        log: state.log,
        meta: { rounds: round + 1, calls, seconds: Math.round((Date.now() - started) / 1000), usage },
      };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
      calls++;
      state.log.push(`round ${round + 1}: ${u.name}(${JSON.stringify(u.input)})`);
      try {
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(runTool(state, u.name, u.input)) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: u.id, content: String(e), is_error: true };
      }
    });
    messages.push({ role: "user", content: results });
  }
}

async function observations(req: Request) {
  const fs = firstScreen({ customer_id: req.customer_id, view: req.view, period: req.period, priorities: req.priorities });
  const state: RunState = { req, sources: [], signal_groups: [], priority_change: null, extraNumbers: [], log: [] };
  const overview = runTool(state, "get_overview", {});
  const groups = runTool(state, "get_signal_groups", {});
  const started = Date.now();
  const msg = await create({
    system: observationsSystem(req),
    messages: [{ role: "user", content: JSON.stringify({ first_screen: overview, signal_groups: groups }) }],
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
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
                additionalProperties: false,
              },
            },
          },
          required: ["observations"],
          additionalProperties: false,
        },
      },
    },
  });
  void fs;
  const parsed = JSON.parse(textOf(msg)) as { observations: { text: string; kpi_ids: string[]; signal_ids: string[] }[] };
  return {
    observations: parsed.observations.map((o) => {
      const sources = state.sources.filter((s) => o.kpi_ids.includes(s.kpi_id));
      const signal_groups = state.signal_groups.filter((g) => o.signal_ids.includes(g.signal_id));
      const extra = signal_groups.flatMap((g) => [g.fired_count, g.largest_gap, ...g.results.map((r) => r.gap)]);
      return { ...o, sources, signal_groups, unmatched_numbers: unmatchedNumbers(o.text, sources, [...extra, fsSiteCount()]) };
    }),
    meta: { seconds: Math.round((Date.now() - started) / 1000), usage: msg.usage },
  };
}

const fsSiteCount = () => sites.length;

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
  const out: string[] = [`# Prototype run: Answer and observation format`, ``, `Model ${MODEL}, effort low, ${new Date().toISOString()}. NorthStar Foods Group, period ${PERIOD}, no Site filter, default priorities.`, ``];
  for (const [i, p] of PROMPTS.entries()) {
    console.error(`prompt ${i + 1}...`);
    const r = await assistantAnswer(base(p.view), p.prompt);
    out.push(
      `## ${i + 1}. ${p.prompt}`,
      ``,
      `${p.view} view. Expected: ${p.expected}. ${r.meta.rounds} rounds, ${r.meta.calls} calls, ${r.meta.seconds} s, ${r.meta.usage.input} in / ${r.meta.usage.output} out tokens.`,
      ``,
      `**Answer**`,
      ``,
      r.answer.split("\n").map((l) => `> ${l}`).join("\n"),
      ``,
      `**unmatched_numbers:** ${r.unmatched_numbers.length ? r.unmatched_numbers.join(", ") : "none"}`,
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
  for (const view of ["KAM", "Customer"] as View[]) {
    console.error(`observations ${view}...`);
    const r = await observations(base(view));
    out.push(`## Generate observations, ${view} view`, ``, `${r.meta.seconds} s.`, ``);
    for (const [i, o] of r.observations.entries()) {
      out.push(
        `${i + 1}. ${o.text}`,
        `   - kpi_ids: ${o.kpi_ids.join(", ") || "none"}; signal_ids: ${o.signal_ids.join(", ") || "none"}; unmatched_numbers: ${o.unmatched_numbers.join(", ") || "none"}`,
      );
    }
    out.push(``);
  }
  writeFileSync(new URL("./prototype-answer-format.out.md", import.meta.url), out.join("\n"));
  console.error("wrote lib/assistant/prototype-answer-format.out.md");
}

await main();
