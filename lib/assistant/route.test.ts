import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssistantAnswer, AssistantError, ObservationsReply } from "./contract.ts";
import { AssistantFailureError } from "./errors.ts";
import type { Chat } from "./ollama.ts";
import { ollamaChat } from "./ollama.ts";
import type { AssistantRouteOptions } from "./route.ts";
import { assistantRoute, observationsRoute } from "./route.ts";

const postAssistant = (request: Request, options: AssistantRouteOptions) => assistantRoute(options)(request);

const BODY = {
  prompt: "Show the value created for NorthStar Foods Group in 2025.",
  customer_id: "CUST001",
  period: "2025",
  view: "KAM",
  priorities: ["water", "service_reliability", "emissions"],
};

const post = (body: unknown) =>
  new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const answering: Chat = async () => ({ message: { role: "assistant", content: "The data does not hold cost." } });

async function errorOf(res: Response): Promise<[number, string]> {
  const body = (await res.json()) as AssistantError;
  return [res.status, body.error.code];
}

test("an answer comes back as one JSON body", async () => {
  const res = await postAssistant(post(BODY), { chat: answering });
  assert.equal(res.status, 200);
  const body = (await res.json()) as AssistantAnswer;
  assert.equal(body.answer, "The data does not hold cost.");
  assert.deepEqual(body.sources, []);
});

test("bad requests return bad_request (400)", async () => {
  const { prompt: _, ...noPrompt } = BODY;
  const cases: unknown[] = [
    "{not json",
    [],
    noPrompt,
    { ...BODY, prompt: "  " },
    { ...BODY, customer_id: "CUST999" },
    { ...BODY, site_id: "S025" }, // a Site of another Customer
    { ...BODY, site_id: "S999" },
    { ...BODY, priorities: ["water", "hygiene"] },
    { ...BODY, priorities: ["water", "water"] },
    { ...BODY, priorities: "water" },
    { ...BODY, period: "2031" },
    { ...BODY, view: "Admin" },
  ];
  for (const body of cases) {
    let called = false;
    const chat: Chat = async (r, s) => ((called = true), answering(r, s));
    const res = await postAssistant(post(body), { chat });
    assert.deepEqual(await errorOf(res), [400, "bad_request"], JSON.stringify(body));
    assert.equal(called, false);
  }
});

test("a Site of the request's Customer is accepted", async () => {
  const res = await postAssistant(post({ ...BODY, site_id: "S001" }), { chat: answering });
  assert.equal(res.status, 200);
});

test("a connection error from chat gives model_unavailable (503)", async () => {
  // Nothing listens on port 9, so the real client gets a refused connection.
  const res = await postAssistant(post(BODY), { chat: ollamaChat("http://127.0.0.1:9") });
  assert.deepEqual(await errorOf(res), [503, "model_unavailable"]);
});

test("an aborted signal gives timeout (504)", async () => {
  const hanging: Chat = (_, signal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(new AssistantFailureError("timeout", "Too slow."))));
  const res = await postAssistant(post(BODY), { chat: hanging, timeoutMs: 20 });
  assert.deepEqual(await errorOf(res), [504, "timeout"]);
});

test("a fake chat that ignores the abort still gives timeout", async () => {
  const hanging: Chat = (_, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const res = await postAssistant(post(BODY), { chat: hanging, timeoutMs: 20 });
  assert.deepEqual(await errorOf(res), [504, "timeout"]);
});

test("an empty reply gives model_error (502)", async () => {
  const empty: Chat = async () => ({ message: { role: "assistant", content: "" } });
  const res = await postAssistant(post(BODY), { chat: empty });
  assert.deepEqual(await errorOf(res), [502, "model_error"]);
});

test("ASSISTANT_STUB=1 serves the stub and never calls chat", async () => {
  const before = { stub: process.env.ASSISTANT_STUB, delay: process.env.ASSISTANT_STUB_DELAY_MS };
  process.env.ASSISTANT_STUB = "1";
  process.env.ASSISTANT_STUB_DELAY_MS = "0";
  try {
    const never: Chat = async () => {
      throw new Error("chat called");
    };
    const res = await postAssistant(post(BODY), { chat: never });
    assert.equal(res.status, 200);
    assert.match(((await res.json()) as AssistantAnswer).answer, /^STUB ANSWER/);
  } finally {
    for (const [key, value] of [["ASSISTANT_STUB", before.stub], ["ASSISTANT_STUB_DELAY_MS", before.delay]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

// ---------------------------------------------------------------- POST /api/observations

const { prompt: _prompt, ...OBS_BODY } = BODY;
const postObservations = (body: unknown, options: AssistantRouteOptions) => observationsRoute(options)(post(body));
const observing: Chat = async () => ({
  message: { role: "assistant", content: JSON.stringify({ observations: [{ text: "All Sites washed 502,074.7 kg in 2025.", kpi_ids: ["washed_kg"], signal_ids: [] }] }) },
});

test("observations come back as one JSON body", async () => {
  const res = await postObservations(OBS_BODY, { chat: observing });
  assert.equal(res.status, 200);
  const body = (await res.json()) as ObservationsReply;
  assert.deepEqual(body.observations.map((o) => [o.text, o.sources.map((s) => s.kpi_id)]), [["All Sites washed 502,074.7 kg in 2025.", ["washed_kg"]]]);
});

test("observations: bad requests return bad_request (400) and never call chat", async () => {
  for (const body of ["{not json", [], { ...OBS_BODY, customer_id: "CUST999" }, { ...OBS_BODY, site_id: "S025" }, { ...OBS_BODY, view: "Admin" }]) {
    let called = false;
    const chat: Chat = async (r, s) => ((called = true), observing(r, s));
    assert.deepEqual(await errorOf(await postObservations(body, { chat })), [400, "bad_request"], JSON.stringify(body));
    assert.equal(called, false);
  }
});

test("observations: a reply that is not JSON gives model_error (502), and a timeout says 120 s", async () => {
  const broken: Chat = async () => ({ message: { role: "assistant", content: "{" } });
  assert.deepEqual(await errorOf(await postObservations(OBS_BODY, { chat: broken })), [502, "model_error"]);
  const hanging: Chat = (_, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const res = await postObservations(OBS_BODY, { chat: hanging, timeoutMs: 20 });
  assert.equal(res.status, 504);
  assert.deepEqual(await res.json(), { error: { code: "timeout", message: "The model took longer than 120 s." } });
});

test("observations: ASSISTANT_STUB=1 serves the stub and never calls chat", async () => {
  const before = { stub: process.env.ASSISTANT_STUB, delay: process.env.ASSISTANT_STUB_DELAY_MS };
  process.env.ASSISTANT_STUB = "1";
  process.env.ASSISTANT_STUB_DELAY_MS = "0";
  try {
    const never: Chat = async () => {
      throw new Error("chat called");
    };
    const res = await postObservations(OBS_BODY, { chat: never });
    assert.equal(res.status, 200);
    assert.match(((await res.json()) as ObservationsReply).observations[0].text, /^STUB OBSERVATION/);
  } finally {
    for (const [key, value] of [["ASSISTANT_STUB", before.stub], ["ASSISTANT_STUB_DELAY_MS", before.delay]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
