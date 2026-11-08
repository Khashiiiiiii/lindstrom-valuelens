import assert from "node:assert/strict";
import { test } from "node:test";

import type { KpiResult } from "../data.ts";
import { firstScreen, listKpis, runKpi, signalGroups } from "../data.ts";
import { answerPrompt } from "./answer.ts";
import type { AssistantRequest } from "./contract.ts";
import { AssistantFailureError } from "./errors.ts";
import type { Chat, ChatReply, ChatRequest } from "./ollama.ts";

const KAM: AssistantRequest = {
  prompt: "Show the value created for NorthStar Foods Group in 2025.",
  customer_id: "CUST001",
  period: "2025",
  view: "KAM",
  priorities: ["water", "service_reliability", "emissions"],
};
const CUSTOMER: AssistantRequest = { ...KAM, view: "Customer" };

type Step = ChatReply | ((request: ChatRequest) => ChatReply);

const text = (content: string): ChatReply => ({ message: { role: "assistant", content } });
const calls = (...uses: [name: string, args: unknown][]): ChatReply => ({
  message: { role: "assistant", content: "", tool_calls: uses.map(([name, args]) => ({ function: { name, arguments: args } })) },
});

/** A Chat that replies with the steps in order and records every request it got. */
function scripted(...steps: Step[]): Chat & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  const chat = async (request: ChatRequest) => {
    requests.push(structuredClone(request));
    const step = steps[requests.length - 1];
    if (!step) throw new Error(`No scripted reply for request ${requests.length}.`);
    return typeof step === "function" ? step(request) : step;
  };
  return Object.assign(chat, { requests });
}

const run = (request: AssistantRequest, chat: Chat) => answerPrompt(request, { chat, signal: new AbortController().signal });

/** The tool results the model got back in the last request. */
const toolResults = (chat: { requests: ChatRequest[] }) =>
  chat.requests.at(-1)!.messages.filter((m) => m.role === "tool").map((m) => m.content);

test("a get_kpis call fills sources with the full KpiAnswers, deduped", async () => {
  const chat = scripted(
    calls(["get_kpis", { kpi_ids: ["water_saved", "washed_kg"] }], ["get_kpis", { kpi_ids: ["water_saved"] }]),
    text("Water saved was high."),
  );
  const res = await run(KAM, chat);
  const query = { scope: { customer_id: "CUST001" }, period: "2025", view: "KAM" } as const;
  assert.deepEqual(res.sources, [runKpi("water_saved", query), runKpi("washed_kg", query)]);
  assert.equal(res.answer, "Water saved was high.");
  assert.deepEqual(res.signal_groups, []);
  assert.equal(res.priority_change, null);
  assert.deepEqual(res.unmatched_numbers, []);
});

test("the Customer view never offers a KAM-only id, and a KAM-only result comes back withheld", async () => {
  const kamOnly = listKpis("KAM").filter((k) => k.view === "KAM").map((k) => k.id);
  assert.ok(kamOnly.includes("account_health"));
  const chat = scripted(
    calls(["get_kpis", { kpi_ids: ["improvement_scan_coverage"], site_id: "S001" }], ["get_kpis", { kpi_ids: ["account_health"] }]),
    text("Scan coverage at Helsinki is not available in this view."),
  );
  const res = await run(CUSTOMER, chat);
  const offered = JSON.stringify(chat.requests[0].tools);
  for (const id of kamOnly) assert.ok(!offered.includes(`"${id}"`) && !offered.includes(`${id} (`), `${id} is offered`);
  const withheld = { kpi_id: "improvement_scan_coverage", withheld: true, reason: "KAM view only" };
  assert.deepEqual(res.sources, [withheld]);
  const [first, second] = toolResults(chat);
  assert.deepEqual(JSON.parse(first), [withheld]);
  assert.match(second, /^Error: .*account_health/);
});

test('site_id "all" gives a whole-Customer result, also under a Site filter', async () => {
  const chat = scripted(
    calls(["get_kpis", { kpi_ids: ["washed_kg"], site_id: "all" }], ["get_kpis", { kpi_ids: ["washed_kg"], site_id: "CUST001" }], ["get_kpis", { kpi_ids: ["washed_kg"] }]),
    text("Washed kg for all Sites."),
  );
  const res = await run({ ...KAM, site_id: "S002" }, chat);
  assert.deepEqual(
    res.sources.map((s) => (s as KpiResult).scope),
    [{ customer_id: "CUST001" }, { customer_id: "CUST001", site_id: "S002" }],
  );
  assert.equal(JSON.parse(toolResults(chat)[0])[0].site, "all Sites");
});

test("a bad argument or arguments that are not valid JSON come back to the model as a tool error", async () => {
  const chat = scripted(
    calls(
      ["get_kpis", { kpi_ids: ["washed_kg"], site_id: "S999" }],
      ["get_kpis", "{kpi_ids: [washed_kg"],
      ["get_kpis", { kpi_ids: [] }],
      ["get_kpis", { kpi_ids: ["washed_kg"], period: "2031" }],
      ["get_overview", { period: "last year" }],
      ["make_coffee", {}],
      ["get_kpis", '{"kpi_ids": ["washed_kg"]}'],
    ),
    text("Washed kg for all Sites."),
  );
  const res = await run(KAM, chat);
  const results = toolResults(chat);
  assert.equal(results.length, 7);
  for (const r of results.slice(0, 6)) assert.match(r, /^Error: /);
  assert.match(results[0], /site_id must be one of/);
  assert.match(results[1], /not valid JSON/);
  assert.equal(JSON.parse(results[6])[0].kpi_id, "washed_kg");
  assert.deepEqual(res.sources.map((s) => s.kpi_id), ["washed_kg"]);
});

const kpis = (n: number) => Array.from({ length: n }, (): [string, unknown] => ["get_kpis", { kpi_ids: ["washed_kg"] }]);

test("the 3 round limit ends in one request with no tools, and tool calls in it are ignored", async () => {
  const chat = scripted(calls(...kpis(1)), calls(...kpis(1)), calls(...kpis(1)), calls(...kpis(1)));
  await assert.rejects(run(KAM, chat), { code: "model_error" });
  assert.equal(chat.requests.length, 4);
  assert.ok(chat.requests.slice(0, 3).every((r) => r.tools?.length === 3));
  assert.equal(chat.requests[3].tools, undefined);
  assert.equal(chat.requests[3].messages.at(-1)!.content, "No more tool calls. Write the answer now.");
  assert.equal(toolResults(chat).length, 3);
});

test("the 8 call limit drops later calls and ends in one request with no tools", async () => {
  const chat = scripted(calls(...kpis(5)), calls(...kpis(5)), text("Washed kg for all Sites."));
  const res = await run(KAM, chat);
  assert.equal(res.answer, "Washed kg for all Sites.");
  assert.equal(chat.requests.length, 3);
  assert.equal(chat.requests[2].tools, undefined);
  assert.equal(toolResults(chat).length, 8);
  const calledFor = chat.requests[2].messages.flatMap((m) => m.tool_calls ?? []);
  assert.equal(calledFor.length, 8);
});

test("an empty reply gives model_error, and thinking tags are stripped", async () => {
  await assert.rejects(run(KAM, scripted(text("  "))), { code: "model_error" });
  await assert.rejects(run(KAM, scripted(text("<think>hmm</think>\n"))), { code: "model_error" });
  const res = await run(KAM, scripted(text("<think>Let me see.</think>\nThe data does not hold cost.")));
  assert.equal(res.answer, "The data does not hold cost.");
});

test("an error from chat passes through as it is", async () => {
  const failing: Chat = async () => {
    throw new AssistantFailureError("model_unavailable", "Ollama is not reachable.");
  };
  await assert.rejects(run(KAM, failing), { code: "model_unavailable" });
});

test("a text with an unknown number gets exactly one retry, and a number still wrong after it is in unmatched_numbers", async () => {
  const chat = scripted(
    calls(["get_kpis", { kpi_ids: ["washed_kg"] }]),
    text("All Sites washed 600,000 kg in 2025."),
    text("All Sites washed 502,074.7 kg in 2025, about 510,000 kg."),
  );
  const res = await run(KAM, chat);
  assert.equal(chat.requests.length, 3);
  const retry = chat.requests[2];
  assert.equal(retry.tools, undefined);
  assert.deepEqual(retry.messages.at(-2), { role: "assistant", content: "All Sites washed 600,000 kg in 2025." });
  assert.match(retry.messages.at(-1)!.content, /600,000/);
  assert.match(retry.messages.at(-1)!.content, /Write the whole answer again/);
  assert.equal(res.answer, "All Sites washed 502,074.7 kg in 2025, about 510,000 kg.");
  assert.deepEqual(res.unmatched_numbers, ["510,000"]);
});

test("a text with no problems gets no retry", async () => {
  const chat = scripted(calls(["get_kpis", { kpi_ids: ["washed_kg"] }]), text("All Sites washed 502,074.7 kg in 2025."));
  const res = await run(KAM, chat);
  assert.equal(chat.requests.length, 2);
  assert.deepEqual(res.unmatched_numbers, []);
});

test("an empty retry keeps the first text", async () => {
  const chat = scripted(text("The Customer has 99 Sites."), text("<think>Again.</think>  "));
  const res = await run(KAM, chat);
  assert.equal(chat.requests.length, 2);
  assert.equal(res.answer, "The Customer has 99 Sites.");
  assert.deepEqual(res.unmatched_numbers, ["99"]);
});

test("the Site count is known without a tool call", async () => {
  const res = await run(KAM, scripted(text("The Customer has 24 Sites.")));
  assert.deepEqual(res.unmatched_numbers, []);
});

test("an answer naming Sites of a fired signal group returns that group in signal_groups", async () => {
  const chat = scripted(
    calls(["get_signal_groups", {}]),
    text("Garment allocation above peers is flagged for discussion at Malmö and Kraków (owner: Joint)."),
  );
  const res = await run(KAM, chat);
  assert.equal(chat.requests.length, 2);
  const fired = signalGroups({ customer_id: "CUST001", view: "KAM", priorities: KAM.priorities });
  const expected = fired.filter((g) => ["garment_allocation_above_peers", "washes_per_garment_above_peers"].includes(g.signal_id));
  assert.deepEqual(res.signal_groups, expected);
});

test("get_overview gives the first screen's answers as sources and the fired signal groups to the model", async () => {
  const chat = scripted(calls(["get_overview", {}], ["get_signal_groups", {}]), text("Here is the overview."));
  const res = await run(CUSTOMER, chat);
  const fs = firstScreen({ customer_id: "CUST001", view: "Customer", period: "2025", priorities: CUSTOMER.priorities });
  const ids = new Set([...fs.tiles, ...fs.priority_blocks].flatMap((t) => t.answers.map((a) => a.kpi_id)));
  assert.deepEqual(new Set(res.sources.map((s) => s.kpi_id)), ids);
  const [overview, groups] = toolResults(chat).map((r) => JSON.parse(r));
  const fired = signalGroups({ customer_id: "CUST001", view: "Customer", priorities: CUSTOMER.priorities });
  assert.deepEqual(overview.opportunity_signals.groups.map((g: { signal_id: string }) => g.signal_id), fired.map((g) => g.signal_id));
  assert.ok(overview.opportunity_signals.proposed_next_steps.length <= 3);
  assert.equal(overview.site_count, 24);
  assert.match(groups.gap_meaning, /median/);
  assert.equal(groups.groups[0].results[0].site_name.startsWith("NorthStar "), true);
  assert.ok(!JSON.stringify([overview, groups]).includes('"assumptions"'));
});
