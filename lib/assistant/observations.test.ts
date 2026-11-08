import assert from "node:assert/strict";
import { test } from "node:test";

import { listKpis, runKpi, signalGroups } from "../data.ts";
import type { ObservationsRequest } from "./contract.ts";
import type { Chat, ChatReply, ChatRequest } from "./ollama.ts";
import { generateObservations, OBSERVATIONS_SCHEMA } from "./observations.ts";

const KAM: ObservationsRequest = {
  customer_id: "CUST001",
  period: "2025",
  view: "KAM",
  priorities: ["water", "service_reliability", "emissions"],
};
const CUSTOMER: ObservationsRequest = { ...KAM, view: "Customer" };

type Obs = { text: string; kpi_ids: string[]; signal_ids: string[] };

const json = (observations: Obs[]): ChatReply => ({ message: { role: "assistant", content: JSON.stringify({ observations }) } });
const raw = (content: string): ChatReply => ({ message: { role: "assistant", content } });

/** A Chat that replies with the steps in order and records every request it got. */
function scripted(...steps: ChatReply[]): Chat & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  const chat = async (request: ChatRequest) => {
    requests.push(structuredClone(request));
    const step = steps[requests.length - 1];
    if (!step) throw new Error(`No scripted reply for request ${requests.length}.`);
    return step;
  };
  return Object.assign(chat, { requests });
}

const run = (request: ObservationsRequest, chat: Chat) => generateObservations(request, { chat, signal: new AbortController().signal });

// washed_kg for NorthStar in 2025 is 502,074.7 kg, a tile of the first screen.
const clean = (text = "All Sites washed 502,074.7 kg in 2025."): Obs => ({ text, kpi_ids: ["washed_kg"], signal_ids: [] });

test("of 5 observations the reply keeps the first 3, and the model gets the overview as JSON with the schema", async () => {
  const five = [1, 2, 3, 4, 5].map((i) => clean(`Observation ${i}: all Sites washed 502,074.7 kg in 2025.`));
  const chat = scripted(json(five));
  const res = await run(KAM, chat);
  assert.deepEqual(res.observations.map((o) => o.text.slice(0, 13)), ["Observation 1", "Observation 2", "Observation 3"]);
  assert.equal(chat.requests.length, 1);
  const [request] = chat.requests;
  assert.deepEqual(request.format, OBSERVATIONS_SCHEMA);
  assert.equal(request.tools, undefined);
  assert.equal(request.messages[0].role, "system");
  const input = JSON.parse(request.messages[1].content);
  assert.equal(input.first_screen.site_count, 24);
});

const fired = (request: ObservationsRequest) => signalGroups({ customer_id: request.customer_id, view: request.view, priorities: request.priorities });
const kamQuery = { scope: { customer_id: "CUST001" }, period: "2025", view: "KAM" } as const;

test("the server owns the tags: a signal id in kpi_ids moves over, a signal whose Sites are not named and an unknown KPI id are dropped", async () => {
  const chat = scripted(
    json([
      {
        text: "Garment allocation above peers is flagged for discussion at Malmö. All Sites washed 502,074.7 kg in 2025.",
        kpi_ids: ["garment_allocation_above_peers", "washed_kg", "made_up_kpi"],
        // Late service cycles fired on Pori, which the text does not name.
        signal_ids: ["late_service_cycles_above_peers", "no_such_signal"],
      },
    ]),
  );
  const [obs] = (await run(KAM, chat)).observations;
  const garment = fired(KAM).find((g) => g.signal_id === "garment_allocation_above_peers")!;
  assert.deepEqual(obs.signal_groups, [garment]);
  assert.deepEqual(obs.sources, [runKpi("washed_kg", kamQuery)]);
  assert.deepEqual(obs.unmatched_numbers, []);
});

test("each observation carries its own sources, signal groups and unmatched numbers", async () => {
  const chat = scripted(
    json([
      { text: "Water saved was 1,406,482.75 l vs outsourced local laundry for all Sites in 2025.", kpi_ids: ["water_saved"], signal_ids: [] },
      { text: "Kraków is flagged for discussion under garment allocation above peers.", kpi_ids: [], signal_ids: ["garment_allocation_above_peers"] },
      // 502,074.7 is a known figure, but not of the KPI this observation lists.
      { text: "All Sites washed 502,074.7 kg in 2025.", kpi_ids: ["on_time_service_cycle_share"], signal_ids: [] },
    ]),
    // The third text breaks no rule of the whole answer, so there is no retry.
  );
  const [water, garment, washed] = (await run(KAM, chat)).observations;
  assert.deepEqual(water.sources, [runKpi("water_saved", kamQuery)]);
  assert.deepEqual(water.signal_groups, []);
  assert.deepEqual(garment.sources, []);
  assert.deepEqual(garment.signal_groups.map((g) => g.signal_id), ["garment_allocation_above_peers"]);
  assert.deepEqual(washed.sources, [runKpi("on_time_service_cycle_share", kamQuery)]);
  assert.deepEqual(washed.unmatched_numbers, ["502,074.7"]);
  assert.equal(chat.requests.length, 1);
});

test("a first reply that is not valid JSON, or not of the schema's shape, gives model_error", async () => {
  for (const content of ["{observations: [", "<think>hmm</think>", '{"observations": "none"}', "[]"]) {
    const chat = scripted(raw(content));
    await assert.rejects(run(KAM, chat), { code: "model_error" }, content);
    assert.equal(chat.requests.length, 1, content);
  }
});

test("an observation that breaks a rule gets one retry of the whole JSON, and the retry's reply is used", async () => {
  const first = [clean(), { text: "Pori shows a problem: 600,000 kg washed.", kpi_ids: ["washed_kg"], signal_ids: [] }];
  const second = [clean(), clean("Late service cycles at Pori are flagged for discussion.")];
  const chat = scripted(json(first), json(second));
  const res = await run(KAM, chat);
  assert.equal(chat.requests.length, 2);
  const retry = chat.requests[1];
  assert.deepEqual(retry.format, OBSERVATIONS_SCHEMA);
  assert.deepEqual(retry.messages.at(-2), { role: "assistant", content: JSON.stringify({ observations: first }) });
  const ask = retry.messages.at(-1)!.content;
  assert.match(ask, /Observation 2: These numbers are in no tool result: 600,000/);
  assert.match(ask, /Observation 2: Do not write "problem"/);
  assert.doesNotMatch(ask, /Observation 1/);
  assert.match(ask, /full JSON again/);
  assert.deepEqual(res.observations.map((o) => o.text), second.map((o) => o.text));
});

test("a retry that is not valid JSON keeps the first reply", async () => {
  const first = [{ text: "All Sites washed 600,000 kg in 2025.", kpi_ids: ["washed_kg"], signal_ids: [] }];
  const chat = scripted(json(first), raw("not json"));
  const res = await run(KAM, chat);
  assert.equal(chat.requests.length, 2);
  assert.deepEqual(res.observations.map((o) => [o.text, o.unmatched_numbers]), [["All Sites washed 600,000 kg in 2025.", ["600,000"]]]);
});

test("in the Customer view no observation's sources holds a KAM-only result that is not withheld", async () => {
  const kamOnly = listKpis("KAM").filter((k) => k.view === "KAM").map((k) => k.id);
  assert.ok(kamOnly.includes("account_health"));
  const chat = scripted(json([{ text: "All Sites washed 502,074.7 kg in 2025.", kpi_ids: ["washed_kg", ...kamOnly], signal_ids: [] }]));
  const [obs] = (await run(CUSTOMER, chat)).observations;
  assert.deepEqual(obs.sources, [runKpi("washed_kg", { ...kamQuery, view: "Customer" })]);
  const input = chat.requests[0].messages[1].content;
  for (const id of kamOnly) assert.ok(!input.includes(`"kpi_id":"${id}","name"`), `${id} reached the model`);
});

test("a reply with no observation, or only empty texts, gives model_error", async () => {
  for (const reply of [json([]), json([{ text: "  ", kpi_ids: [], signal_ids: [] }])]) {
    const chat = scripted(reply);
    await assert.rejects(run(KAM, chat), { code: "model_error" }, reply.message.content);
    assert.equal(chat.requests.length, 1);
  }
});
