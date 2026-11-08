// Stubs of POST /api/assistant and POST /api/observations (#34), so the dashboard's modal is built before the
// assistant's server side. They answer in the contract's shapes (#15) with real runKpi answers as sources. The
// assistant's route handlers replace them.
//
// Test hooks, read from the prompt:
// - A prompt with "error" in it fails with a timeout.
// - The steering committee prompt has an unmatched number.
// - A prompt with "focus" or "priorit" in it that names Customer priorities moves them to the top, in the order the
//   prompt names them (#35). The suggested water and emissions prompt does this.

import type { CustomerPriorityId, KpiAnswer, KpiQuery } from "../data.ts";
import { firstScreen, getMasterData, runKpi, signalGroups } from "../data.ts";
import type { PageRequest } from "../pages/request.ts";
import { BadRequest, pageScope, parsePageRequest } from "../pages/request.ts";
import type { AssistantAnswer, AssistantError, AssistantFailure, ObservationsReply, PriorityChange } from "./contract.ts";

export interface StubReply<T> {
  status: number;
  body: T | AssistantError;
}

/** The stub's reply to a POST /api/assistant body. */
export function stubAnswer(body: unknown): StubReply<AssistantAnswer> {
  return replyTo(body, (request) => {
    const prompt = (body as { prompt?: unknown }).prompt;
    if (typeof prompt !== "string" || prompt.trim() === "") return error(400, "bad_request", "prompt must be a non-empty string.");
    if (/error/i.test(prompt)) return error(504, "timeout", "The model took longer than 90 s.");
    const screen = firstScreen(request);
    const sources = stubSources(request);
    const figures = sources.flatMap((s) =>
      "withheld" in s || s.value === null ? [] : [`${s.name} ${s.value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${s.unit}`],
    );
    const customer = getMasterData().data.customers.find((c) => c.customer_id === request.customer_id)!;
    const groups = signalGroups({ customer_id: request.customer_id, view: request.view, priorities: screen.priority_ids });
    return {
      status: 200,
      body: {
        answer: `STUB ANSWER to "${prompt}" For ${customer.customer_name} in ${request.period}: ${figures.slice(0, 3).join("; ")}.`,
        sources,
        signal_groups: groups.slice(0, 2),
        priority_change: stubPriorityChange(prompt, screen.priority_ids),
        unmatched_numbers: /steering/i.test(prompt) ? ["12%"] : [],
      },
    };
  });
}

/** The stub's reply to a POST /api/observations body: one observation per top signal group, up to 3. */
export function stubObservations(body: unknown): StubReply<ObservationsReply> {
  return replyTo(body, (request) => {
    const screen = firstScreen(request);
    const groups = signalGroups({ customer_id: request.customer_id, view: request.view, priorities: screen.priority_ids });
    const sources = stubSources(request);
    return {
      status: 200,
      body: {
        observations: groups.slice(0, 3).map((g) => ({
          text: `STUB OBSERVATION. ${g.signal_id}: ${g.fired_count} fired result(s). Lever: ${g.lever}`,
          sources: sources.slice(0, 2),
          signal_groups: [g],
          unmatched_numbers: [],
        })),
      },
    };
  });
}

/** The words in a prompt that name each Customer priority. */
const PRIORITY_WORDS: [RegExp, CustomerPriorityId][] = [
  [/water/i, "water"],
  [/emission|co2|carbon/i, "emissions"],
  [/circular|repair|waste/i, "circularity"],
  [/reliab|on-time|late|turnaround/i, "service_reliability"],
  [/utili[sz]|allocation/i, "garment_utilisation"],
  [/trace|scan/i, "traceability"],
  [/improv/i, "improvement"],
];

/**
 * For a prompt with "focus" or "priorit" in it, the priorities it names in the order it names them, then the rest
 * of the current list. A named priority that is not in the list joins it. Null when the prompt has neither word,
 * names no priority, or leaves the order as it is.
 */
function stubPriorityChange(prompt: string, current: CustomerPriorityId[]): PriorityChange | null {
  if (!/focus|priorit/i.test(prompt)) return null;
  const named = PRIORITY_WORDS.flatMap(([words, id]) => {
    const at = prompt.search(words);
    return at < 0 ? [] : [{ at, id }];
  })
    .sort((a, b) => a.at - b.at)
    .map((n) => n.id);
  const priorities = [...new Set([...named, ...current])];
  return priorities.join() === current.join() ? null : { priorities };
}

/**
 * The first priority block's answers, if there is a block, and account health, as runKpi answers for the request.
 * Account health is KAM only, so in the Customer view it is a Withheld source.
 */
function stubSources(request: PageRequest): KpiAnswer[] {
  const query: KpiQuery = { scope: pageScope(request), period: request.period, view: request.view };
  const ids = new Set([...(firstScreen(request).priority_blocks[0]?.kpi_ids ?? []), "account_health"]);
  return [...ids].map((id) => runKpi(id, query));
}

/** Parses the body and answers bad_request (400) when it is not a request of the route. */
function replyTo<T>(body: unknown, answer: (request: PageRequest) => StubReply<T>): StubReply<T> {
  try {
    return answer(parsePageRequest(body));
  } catch (e) {
    if (!(e instanceof BadRequest)) throw e;
    return error(400, "bad_request", e.message);
  }
}

function error(status: number, code: AssistantFailure["code"], message: string): StubReply<never> {
  return { status, body: { error: { code, message } } };
}

/** A POST route handler for a stub. It waits ASSISTANT_STUB_DELAY_MS, default `delay_ms`, so the counter shows. */
export function stubRoute<T>(stub: (body: unknown) => StubReply<T>, delay_ms: number): (request: Request) => Promise<Response> {
  return async (request) => {
    const body: unknown = await request.json().catch(() => null);
    const wait = Number(process.env.ASSISTANT_STUB_DELAY_MS ?? delay_ms);
    await new Promise((resolve) => setTimeout(resolve, wait));
    const reply = stub(body);
    return Response.json(reply.body, { status: reply.status });
  };
}
