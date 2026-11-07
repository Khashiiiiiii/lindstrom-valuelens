import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssistantAnswer } from "../../lib/assistant/contract.ts";
import { SUGGESTED_PROMPTS } from "../../lib/assistant/contract.ts";
import type { AssistantAction, AssistantState } from "./assistant-state.ts";
import { assistantState, INITIAL, workingSeconds } from "./assistant-state.ts";

const answer: AssistantAnswer = { answer: "Stub.", sources: [], signal_groups: [], priority_change: null, unmatched_numbers: [] };
const run = (state: AssistantState, ...actions: AssistantAction[]) => actions.reduce(assistantState, state);

test("a prompt starts a request, and its answer replaces the pending request", () => {
  const asking = run(INITIAL, { type: "open" }, { type: "ask", prompt: SUGGESTED_PROMPTS[0], request_id: 1, at: 1_000 });
  assert.deepEqual(asking.pending, { request_id: 1, started_at: 1_000 });
  assert.equal(asking.prompt, SUGGESTED_PROMPTS[0]);
  assert.equal(workingSeconds(asking, 15_400), 14);
  const answered = run(asking, { type: "answer", request_id: 1, answer });
  assert.deepEqual(answered, { open: true, prompt: SUGGESTED_PROMPTS[0], pending: null, answer, error: null, unread: false });
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
  assert.deepEqual([retried.prompt, retried.error, retried.pending], ["Show me an error.", null, { request_id: 2, started_at: 9_000 }]);
});
