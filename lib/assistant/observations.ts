// The AI observations runner (Spec: AI assistant #39, issue #43). The server runs get_overview itself, so the model
// makes no tool calls: it gets the first screen as JSON and replies in the observations schema. Ported from the
// prototype (branch prototype/answer-format, commit 70528bb, round 4).

import { listKpis } from "../data.ts";
import type { AnswerDeps } from "./answer.ts";
import { stripThinking } from "./answer.ts";
import { MAX_OBSERVATIONS, observationsSystem } from "./context.ts";
import type { CheckState } from "./checks.ts";
import { answerProblems, namedSignalGroups, unmatchedNumbers } from "./checks.ts";
import type { Observation, ObservationsReply, ObservationsRequest } from "./contract.ts";
import { AssistantFailureError } from "./errors.ts";
import type { ChatMessage } from "./ollama.ts";
import { buildTools } from "./tools.ts";

/** The Ollama `format` of the model's reply. The server re-checks every field, since a small model can stray. */
export const OBSERVATIONS_SCHEMA = {
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

/** What the model wrote for one observation, before the server tags it. */
interface Draft {
  text: string;
  kpi_ids: string[];
  signal_ids: string[];
}

/** Up to MAX_OBSERVATIONS observations for a validated request. Throws AssistantFailureError. */
export async function generateObservations(request: ObservationsRequest, { chat, signal }: AnswerDeps): Promise<ObservationsReply> {
  const tools = buildTools(request);
  const kpiIds = new Set(listKpis(request.view).map((k) => k.id));
  const input = { first_screen: tools.run("get_overview", {}) };
  const messages: ChatMessage[] = [
    { role: "system", content: observationsSystem(request) },
    { role: "user", content: JSON.stringify(input) },
  ];
  const reply = await chat({ messages, format: OBSERVATIONS_SCHEMA }, signal);
  const first = parseDrafts(reply.message.content ?? "");
  if (!first) throw new AssistantFailureError("model_error", "The model's observations are not valid JSON.");
  // The dashboard shows 1 to 3 observations or an error with "Try again", never an empty list.
  if (first.length === 0) throw new AssistantFailureError("model_error", "The model returned no observation.");
  const drafts = await retryOnce(first, reply.message.content ?? "", messages, tools.state, { chat, signal });
  return { observations: drafts.slice(0, MAX_OBSERVATIONS).map((d) => tag(d, tools.state, kpiIds)) };
}

/**
 * The server owns the tags. A signal id given as a KPI id moves to the signal ids, and a signal id stays only if the
 * text names one of its Sites. Unknown KPI ids are dropped. The sources are the view's own results of get_overview,
 * so in the Customer view a KAM-only KPI is never one.
 */
function tag(draft: Draft, state: CheckState, kpiIds: Set<string>): Observation {
  const named = new Set<string>(namedSignalGroups(draft.text, state).map((g) => g.signal_id));
  const signalIds = new Set([...draft.signal_ids, ...draft.kpi_ids].filter((id) => named.has(id)));
  const kpis = new Set(draft.kpi_ids.filter((id) => kpiIds.has(id)));
  const sources = state.sources.filter((s) => kpis.has(s.kpi_id));
  const signal_groups = state.signal_groups.filter((g) => signalIds.has(g.signal_id));
  // KPI figures are checked against this observation's own sources, so the dashboard warns about a figure they do
  // not show. The other known numbers are the ones the retry check used, so the two checks agree.
  return { text: draft.text, sources, signal_groups, unmatched_numbers: unmatchedNumbers(draft.text, sources, state.extra_numbers) };
}

/**
 * When an observation breaks the answer rules, sends the problems back once and asks for the whole JSON again. A
 * retry that is not valid JSON, or holds no observation, keeps the first reply.
 */
async function retryOnce(drafts: Draft[], content: string, messages: ChatMessage[], state: CheckState, { chat, signal }: AnswerDeps): Promise<Draft[]> {
  const problems = drafts.flatMap((d, i) => answerProblems(d.text, state).map((p) => `Observation ${i + 1}: ${p}`));
  if (problems.length === 0) return drafts;
  const retry: ChatMessage[] = [
    ...messages,
    { role: "assistant", content },
    { role: "user", content: `Your observations break these rules:\n${problems.map((p) => `- ${p}`).join("\n")}\nReply with the full JSON again.` },
  ];
  const again = await chat({ messages: retry, format: OBSERVATIONS_SCHEMA }, signal);
  const second = parseDrafts(again.message.content ?? "");
  return second?.length ? second : drafts;
}

/** The drafts in a reply, or null when it is not JSON of the schema's shape. Fields of the wrong type are emptied. */
function parseDrafts(content: string): Draft[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripThinking(content));
  } catch {
    return null;
  }
  const list = (parsed as { observations?: unknown } | null)?.observations;
  if (!Array.isArray(list)) return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return list.flatMap((o) => {
    const text = typeof o?.text === "string" ? o.text.trim() : "";
    return text ? [{ text, kpi_ids: strings(o.kpi_ids), signal_ids: strings(o.signal_ids) }] : [];
  });
}
