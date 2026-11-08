import assert from "node:assert/strict";
import { test } from "node:test";

import type { KpiAnswer } from "../../../lib/data.ts";
import { runKpi } from "../../../lib/data.ts";
import type { AssistantAnswer, AssistantError } from "../../../lib/assistant/contract.ts";
import { SUGGESTED_PROMPTS } from "../../../lib/assistant/contract.ts";
import { POST } from "./route.ts";

// The stub waits before it answers, so the dashboard's counter shows. The tests need no wait.
process.env.ASSISTANT_STUB_DELAY_MS = "0";
// These tests cover the stub. lib/assistant/route.test.ts covers the model route.
process.env.ASSISTANT_STUB = "1";

const request = { customer_id: "CUST001", period: "2025", view: "KAM", priorities: ["water", "service_reliability", "emissions"] };

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/assistant answers each suggested prompt with runKpi answers as its sources", async () => {
  for (const prompt of SUGGESTED_PROMPTS) {
    const response = await post({ ...request, prompt });
    assert.equal(response.status, 200, prompt);
    const reply = (await response.json()) as AssistantAnswer;
    assert.ok(reply.answer.length > 0, prompt);
    assert.ok(reply.sources.length > 0, prompt);
    for (const source of reply.sources) {
      const expected = runKpi(source.kpi_id, { scope: { customer_id: "CUST001" }, period: "2025", view: "KAM" });
      assert.deepEqual(source, JSON.parse(JSON.stringify(expected)), `${prompt}: ${source.kpi_id}`);
    }
  }
});

test(`POST /api/assistant moves the priorities a "Focus on" prompt names to the top, and no other suggested prompt changes them`, async () => {
  for (const prompt of SUGGESTED_PROMPTS) {
    const reply = (await (await post({ ...request, prompt })).json()) as AssistantAnswer;
    const expected = prompt === SUGGESTED_PROMPTS[1] ? { priorities: ["water", "emissions", "service_reliability"] } : null;
    assert.deepEqual(reply.priority_change, expected, prompt);
  }
});

test("POST /api/assistant adds a named priority that is not in the list, and sends no change when the order stays", async () => {
  const added = (await (await post({ ...request, prompt: "Prioritise circularity." })).json()) as AssistantAnswer;
  assert.deepEqual(added.priority_change, { priorities: ["circularity", "water", "service_reliability", "emissions"] });
  const same = (await (await post({ ...request, prompt: "Focus on water." })).json()) as AssistantAnswer;
  assert.equal(same.priority_change, null);
});

test("POST /api/assistant in the Customer view returns account health as a Withheld source", async () => {
  const reply = (await (await post({ ...request, view: "Customer", prompt: SUGGESTED_PROMPTS[0] })).json()) as AssistantAnswer;
  const withheld: KpiAnswer = { kpi_id: "account_health", withheld: true, reason: "KAM view only" };
  assert.deepEqual(reply.sources.filter((s) => "withheld" in s), [withheld]);
});

test("POST /api/assistant lists the steering committee answer's unmatched number, and no other answer has one", async () => {
  for (const prompt of SUGGESTED_PROMPTS) {
    const reply = (await (await post({ ...request, prompt })).json()) as AssistantAnswer;
    assert.deepEqual(reply.unmatched_numbers, prompt === SUGGESTED_PROMPTS[5] ? ["12%"] : [], prompt);
  }
});

test("POST /api/assistant fails with a timeout for a prompt that asks for an error", async () => {
  const response = await post({ ...request, prompt: "Show me an error." });
  assert.equal(response.status, 504);
  const expected: AssistantError = { error: { code: "timeout", message: "The model took longer than 90 s." } };
  assert.deepEqual(await response.json(), expected);
});

test("POST /api/assistant returns 400 for a missing prompt and for a Site of another Customer", async () => {
  const noPrompt = await post(request);
  assert.equal(noPrompt.status, 400);
  assert.deepEqual(await noPrompt.json(), { error: { code: "bad_request", message: "prompt must be a non-empty string." } });
  const otherSite = await post({ ...request, customer_id: "CUST002", site_id: "S008", prompt: SUGGESTED_PROMPTS[0] });
  assert.equal(otherSite.status, 400);
  assert.deepEqual(await otherSite.json(), {
    error: { code: "bad_request", message: "Site S008 belongs to CUST001, not CUST002." },
  });
});

test("POST /api/assistant answers with no priorities, with account health as the source", async () => {
  const response = await post({ ...request, priorities: [], prompt: SUGGESTED_PROMPTS[0] });
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as AssistantAnswer).sources.map((s) => s.kpi_id), ["account_health"]);
});
