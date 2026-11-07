import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssistantAnswer, Observation } from "../../lib/assistant/contract.ts";
import { SUGGESTED_PROMPTS } from "../../lib/assistant/contract.ts";
import type { AssistantAction, AssistantState } from "./assistant-state.ts";
import { assistantState, INITIAL, workingSeconds } from "./assistant-state.ts";

const answer: AssistantAnswer = { answer: "Stub.", sources: [], signal_groups: [], priority_change: null, unmatched_numbers: [] };
const observation = (text: string): Observation => ({ text, sources: [], signal_groups: [], unmatched_numbers: [] });
const run = (state: AssistantState, ...actions: AssistantAction[]) => actions.reduce(assistantState, state);

test("a prompt starts a request, and its answer replaces the pending request", () => {
  const asking = run(INITIAL, { type: "open" }, { type: "ask", prompt: SUGGESTED_PROMPTS[0], request_id: 1, at: 1_000 });
  assert.deepEqual(asking.pending, { kind: "ask", request_id: 1, started_at: 1_000 });
  assert.equal(asking.prompt, SUGGESTED_PROMPTS[0]);
  assert.equal(workingSeconds(asking, 15_400), 14);
  const answered = run(asking, { type: "answer", request_id: 1, answer });
  assert.deepEqual(answered, { ...INITIAL, open: true, prompt: SUGGESTED_PROMPTS[0], answer });
});

test("one request runs at a time: a second prompt while one runs is ignored", () => {
  const asking = run(INITIAL, { type: "ask", prompt: SUGGESTED_PROMPTS[0], request_id: 1, at: 0 });
  assert.equal(run(asking, { type: "ask", prompt: SUGGESTED_PROMPTS[1], request_id: 2, at: 500 }), asking);
  assert.equal(run(asking, { type: "answer", request_id: 2, answer }), asking);
});

test("a blank prompt sends no request", () => {
  assert.equal(run(INITIAL, { type: "ask", prompt: "  ", request_id: 1, at: 0 }), INITIAL);
});

test("a reply that arrives with the modal closed puts a dot on the button until the modal opens", () => {
  const replied = run(INITIAL, { type: "open" }, { type: "ask", prompt: "Hi", request_id: 1, at: 0 }, { type: "close" }, { type: "answer", request_id: 1, answer });
  assert.equal(replied.unread, true);
  assert.equal(run(replied, { type: "open" }).unread, false);
});

test("an error keeps the prompt, and Try again sends the same prompt again", () => {
  const error = { code: "timeout", message: "The model took longer than 90 s." } as const;
  const failed = run(INITIAL, { type: "open" }, { type: "ask", prompt: "Show me an error.", request_id: 1, at: 0 }, { type: "failed", request_id: 1, error });
  assert.deepEqual([failed.prompt, failed.error, failed.answer, failed.pending], ["Show me an error.", error, null, null]);
  const retried = run(failed, { type: "ask", prompt: failed.prompt!, request_id: 2, at: 9_000 });
  assert.deepEqual([retried.prompt, retried.error, retried.pending], ["Show me an error.", null, { kind: "ask", request_id: 2, started_at: 9_000 }]);
});

test("no observations show before the first click, and each click replaces the earlier observations", () => {
  const opened = run(INITIAL, { type: "open" }, { type: "tab", tab: "observations" });
  assert.equal(opened.observations, null);
  const first = run(opened, { type: "observe", request_id: 1, at: 0 }, { type: "observations", request_id: 1, observations: [observation("A"), observation("B")] });
  assert.deepEqual(first.observations, [observation("A"), observation("B")]);
  const generating = run(first, { type: "observe", request_id: 2, at: 0 });
  assert.equal(generating.observations, null);
  const second = run(generating, { type: "observations", request_id: 2, observations: [observation("C")] });
  assert.deepEqual([second.observations, second.pending], [[observation("C")], null]);
});

test("one request runs at a time across both tabs", () => {
  const asking = run(INITIAL, { type: "ask", prompt: "Hi", request_id: 1, at: 0 });
  assert.equal(run(asking, { type: "observe", request_id: 2, at: 0 }), asking);
  const observing = run(INITIAL, { type: "observe", request_id: 1, at: 0 });
  assert.equal(run(observing, { type: "ask", prompt: "Hi", request_id: 2, at: 0 }), observing);
});

test("an observations error shows on the Observations tab and keeps the Ask tab's answer", () => {
  const error = { code: "model_unavailable", message: "Ollama is not running." } as const;
  const answered = run(INITIAL, { type: "ask", prompt: "Hi", request_id: 1, at: 0 }, { type: "answer", request_id: 1, answer });
  const failed = run(answered, { type: "observe", request_id: 2, at: 0 }, { type: "failed", request_id: 2, error });
  assert.deepEqual([failed.observations_error, failed.error, failed.answer, failed.observations], [error, null, answer, null]);
  assert.equal(run(failed, { type: "observe", request_id: 3, at: 0 }).observations_error, null);
});

const kam = { type: "scope", customer_id: "CUST001", view: "KAM" } as const;

test("switching to the Customer view with a reply pending clears the modal, and the late reply does not show", () => {
  const asked = run(INITIAL, kam, { type: "open" }, { type: "ask", prompt: "Hi", request_id: 1, at: 0 });
  const answered = run(asked, { type: "answer", request_id: 1, answer }, { type: "observe", request_id: 2, at: 0 });
  const switched = run(answered, { ...kam, view: "Customer" });
  assert.deepEqual(switched, { ...INITIAL, open: true, scope: { customer_id: "CUST001", view: "Customer" } });
  assert.equal(run(switched, { type: "observations", request_id: 2, observations: [observation("KAM only")] }), switched);
});

test("switching Customer clears the answer, the observations and the dot", () => {
  const replied = run(INITIAL, kam, { type: "observe", request_id: 1, at: 0 }, { type: "observations", request_id: 1, observations: [observation("A")] });
  assert.equal(replied.unread, true);
  const switched = run(replied, { ...kam, customer_id: "CUST002" });
  assert.deepEqual([switched.observations, switched.unread], [null, false]);
});

test("the same Customer and view keeps the answer, so a period or Site switch keeps it", () => {
  const answered = run(INITIAL, kam, { type: "ask", prompt: "Hi", request_id: 1, at: 0 }, { type: "answer", request_id: 1, answer });
  assert.equal(run(answered, kam), answered);
});
