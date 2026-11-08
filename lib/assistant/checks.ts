// The checks every Assistant answer passes before it goes out (Spec: AI assistant #39, issue #41). Pure functions,
// ported from the prototype (branch prototype/answer-format, commit 70528bb). English number formats only.

import type { KpiAnswer, SignalGroup } from "../data.ts";
import { getOpportunitySignals } from "../data.ts";

/** What the checks need from one answer's tool calls. */
export interface CheckState {
  /** Every KPI result the tools returned. */
  sources: KpiAnswer[];
  /** The fired signal groups the model was last given. */
  signal_groups: SignalGroup[];
  /** Known numbers besides the sources: the Site count and signalNumbers of what the model was given. */
  extra_numbers: number[];
  /** The Customer's Sites, each with the short name the text uses. */
  sites: { site_id: string; short_name: string }[];
}

/** The Site name without the Customer's brand prefix: "Helsinki" for "NorthStar Helsinki" of "NorthStar Foods Group". */
export function siteShortName(site_name: string, customer_name: string): string {
  const brand = `${customer_name.split(" ")[0]} `;
  return site_name.startsWith(brand) ? site_name.slice(brand.length) : site_name;
}

/** The signal groups whose Sites the text names. The dashboard shows their levers and owners under the answer. */
export function namedSignalGroups(text: string, state: CheckState): SignalGroup[] {
  const short = shortNames(state);
  return state.signal_groups.filter((g) => g.results.some((r) => mentions(text, short(r.site_id))));
}

const BANNED_WORDS = /\b(issues?|problems?|inefficien\w*|overuse|poor|failing|proves?)\b/gi;

/** What is wrong with an answer, each as a line the model can act on. Empty when the answer passes. */
export function answerProblems(text: string, state: CheckState): string[] {
  const out: string[] = [];
  const unmatched = unmatchedNumbers(text, state.sources, state.extra_numbers);
  if (unmatched.length) out.push(`These numbers are in no tool result: ${unmatched.join(", ")}. Remove them or use the exact figure from a result.`);

  const banned = new Map([...text.matchAll(BANNED_WORDS)].map(([w]) => [w.toLowerCase(), w]));
  for (const word of banned.values()) {
    out.push(`Do not write "${word}". An opportunity signal only flags a Site for discussion.`);
  }

  // Each sentence or line with a saved figure must name one of the baselines the sources used.
  const labels = [...new Set(state.sources.flatMap((s) => (!("withheld" in s) && s.detail?.kind === "handprint" ? [s.detail.baseline_label] : [])))];
  const tails = labels.map((l) => l.replace(/^vs\s+/, "").split(" ").slice(-2).join(" ").toLowerCase());
  const unlabelled = text
    .split(/\n|(?<=[.!?])\s+(?=[A-Z])/)
    .filter((seg) => !/^\s*caveats?:/i.test(seg) && /\b(saved|saves|saving)\b/i.test(seg) && /\d/.test(seg) && !tails.some((t) => seg.toLowerCase().includes(t)));
  if (labels.length && unlabelled.length) {
    out.push(`Name the baseline (${labels.map((l) => `"${l}"`).join(" or ")}) after each saved figure in: ${unlabelled.map((s) => `"${s.trim().slice(0, 60)}"`).join("; ")}.`);
  }

  // A text that names a signal, by its name or its lever, must list only that signal's Sites.
  const catalogue = getOpportunitySignals().catalogue;
  const signalName = (g: SignalGroup) => catalogue.find((e) => e.id === g.signal_id)!.name;
  const lower = text.toLowerCase();
  const named = state.signal_groups.filter((g) => lower.includes(signalName(g).toLowerCase()) || lower.includes(g.lever.toLowerCase().replace(/\.$/, "")));
  if (named.length) {
    const short = shortNames(state);
    const allowed = new Set(named.flatMap((g) => g.results.map((r) => r.site_id)));
    const others = state.sites.filter((s) => !allowed.has(s.site_id) && mentions(text, s.short_name)).map((s) => s.short_name);
    if (others.length) {
      const fired = named.map((g) => `"${signalName(g)}" fired on: ${g.results.map((r) => `${short(r.site_id)} (gap ${(r.gap * 100).toFixed(2)}%)`).join(", ")}`);
      out.push(`${others.join(", ")} ${others.length === 1 ? "is" : "are"} not in the signal you describe. ${fired.join(". ")}. List each Site under the signal it fired on.`);
    }
  }
  return out;
}

function shortNames(state: CheckState): (site_id: string) => string {
  return (site_id) => state.sites.find((s) => s.site_id === site_id)?.short_name ?? site_id;
}

/** Whether the text names the Site as a whole word, so "Pori" is not found in "Poriville". */
function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "u").test(text);
}

/** A written number: digits with comma thousands, or plain digits, and an optional decimal part. */
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/**
 * Every number in the text that matches no known value. A written number matches a value when it equals the value
 * rounded to the decimal places written.
 */
export function unmatchedNumbers(text: string, sources: KpiAnswer[], extraNumbers: number[]): string[] {
  const known = knownNumbers(sources, extraNumbers);
  // The number pattern has no sign, so a range "15-31" is two numbers, and "-12" is checked as 12.
  const cleaned = text
    .replace(/\b(CUST|S|L|P|B_)\w*\d+\b/g, " ")
    .replace(/\b20\d\d(-H[12]|-\d\d)?\b/g, " ")
    .replace(/\bH[12]\b/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ");
  const out: string[] = [];
  for (const [raw] of cleaned.matchAll(NUMBER)) {
    const written = raw.replace(/,/g, "");
    const n = Number(written);
    const places = written.includes(".") ? written.split(".")[1].length : 0;
    const tolerance = 0.5 * 10 ** -places + 1e-9;
    if (!known.some((k) => Math.abs(Math.abs(k) - n) <= tolerance)) out.push(raw);
  }
  return [...new Set(out)];
}

/**
 * The numbers the signal tools give the model besides KPI results: each group's fired count, largest gap and gaps
 * (as shares and percents), and the thresholds written in the signal definitions.
 */
export function signalNumbers(groups: SignalGroup[]): number[] {
  return [
    ...groups.flatMap((g) => [g.fired_count, ...[g.largest_gap, ...g.results.map((r) => r.gap)].flatMap((gap) => [gap, gap * 100])]),
    ...getOpportunitySignals().catalogue.flatMap((e) => numbersIn(e.definition)),
  ];
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)].map(([raw]) => Number(raw.replace(/,/g, "")));
}

function knownNumbers(sources: KpiAnswer[], extraNumbers: number[]): number[] {
  const known = [...extraNumbers];
  for (const s of sources) {
    if ("withheld" in s) continue;
    for (const n of [s.value, s.volume, ...(s.breakdown ?? []).map((b) => b.value)]) if (typeof n === "number") known.push(n, n * 100);
    // Numbers inside the result's own words are quotes, not figures.
    for (const t of [s.unit, s.name, ...s.caveats]) known.push(...numbersIn(t));
    if (s.detail?.kind === "handprint") {
      const { baseline_amount, customer_washed_kg, share_of_baseline } = s.detail;
      known.push(baseline_amount, customer_washed_kg);
      if (share_of_baseline != null) known.push(share_of_baseline, share_of_baseline * 100);
    }
  }
  return known;
}
