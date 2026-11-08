// The POST /api/assistant (#40) and POST /api/observations (#43) handlers. Each parses the body with the page request
// parsing, sets one AbortController for the whole reply and returns one JSON body. Nothing is stored between
// requests. After each model call they check that the model is fully on the GPU (#44). With ASSISTANT_STUB=1 they
// serve the #34 stubs instead, so the dashboard can be built without Ollama.

import { resolvePriorities } from "../data.ts";
import type { PageRequest } from "../pages/request.ts";
import { BadRequest, parsePageRequest } from "../pages/request.ts";
import type { AnswerDeps } from "./answer.ts";
import { answerPrompt } from "./answer.ts";
import type { AssistantError, AssistantRequest, ObservationsRequest } from "./contract.ts";
import { AssistantFailureError, ERROR_STATUS } from "./errors.ts";
import type { Chat, GpuCheck } from "./ollama.ts";
import { ollamaChat, ollamaGpuCheck } from "./ollama.ts";
import { generateObservations } from "./observations.ts";
import type { StubReply } from "./stub.ts";
import { stubAnswer, stubObservations, stubRoute } from "./stub.ts";

export const ANSWER_TIMEOUT_MS = 90_000;
export const OBSERVATIONS_TIMEOUT_MS = 120_000;
// The stubs wait before they answer, so the dashboard's counter shows.
const ANSWER_STUB_DELAY_MS = 4000;
const OBSERVATIONS_STUB_DELAY_MS = 5000;

export interface AssistantRouteOptions {
  chat?: Chat;
  timeoutMs?: number;
  /** Runs after every model call. Defaults to ollamaGpuCheck() with the default chat, and to none with a fake chat. */
  gpuCheck?: GpuCheck;
}

/** The POST /api/assistant handler. The stub or the model is picked per request from ASSISTANT_STUB. */
export function assistantRoute(options: AssistantRouteOptions = {}) {
  return modelRoute({ parse: parseAssistantRequest, run: answerPrompt, stub: stubAnswer, stubDelayMs: ANSWER_STUB_DELAY_MS, limitMs: ANSWER_TIMEOUT_MS }, options);
}

/** The POST /api/observations handler. The stub or the model is picked per request from ASSISTANT_STUB. */
export function observationsRoute(options: AssistantRouteOptions = {}) {
  return modelRoute({ parse: parseObservationsRequest, run: generateObservations, stub: stubObservations, stubDelayMs: OBSERVATIONS_STUB_DELAY_MS, limitMs: OBSERVATIONS_TIMEOUT_MS }, options);
}

interface ModelRoute<Req, Reply> {
  parse: (body: unknown) => Req;
  run: (request: Req, deps: AnswerDeps) => Promise<Reply>;
  stub: (body: unknown) => StubReply<Reply>;
  stubDelayMs: number;
  /** The route's time limit, which the timeout message states. */
  limitMs: number;
}

function modelRoute<Req, Reply>(route: ModelRoute<Req, Reply>, options: AssistantRouteOptions) {
  const { chat = ollamaChat(), timeoutMs = route.limitMs } = options;
  // A fake chat has no Ollama behind it, so it gets no default check.
  const gpuCheck = options.gpuCheck ?? (options.chat ? null : ollamaGpuCheck());
  const stub = stubRoute(route.stub, route.stubDelayMs);
  return async (request: Request): Promise<Response> => {
    if (process.env.ASSISTANT_STUB === "1") return stub(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let calledModel = false;
    try {
      const parsed = route.parse(await request.json().catch(() => null));
      calledModel = true;
      return Response.json(await route.run(parsed, { chat, signal: controller.signal }));
    } catch (e) {
      return errorResponse(e, controller.signal, route.limitMs);
    } finally {
      clearTimeout(timer);
      // After the model call, also a failed one: a timeout is the likeliest sign of a model partly on the CPU. Not
      // awaited, so the reply never waits for /api/ps.
      if (calledModel && gpuCheck) void gpuCheck().catch(() => {});
    }
  };
}

/** The page request plus a prompt, with the priorities as ids. Throws BadRequest. */
export function parseAssistantRequest(body: unknown): AssistantRequest {
  const prompt = (body as { prompt?: unknown } | null)?.prompt;
  const page = parseObservationsRequest(body);
  if (typeof prompt !== "string" || prompt.trim() === "") throw new BadRequest("prompt must be a non-empty string.");
  return { ...page, prompt: prompt.trim() };
}

/** The page request with the priorities as ids. Throws BadRequest. */
export function parseObservationsRequest(body: unknown): ObservationsRequest {
  const page: PageRequest = parsePageRequest(body);
  return { ...page, priorities: resolvePriorities(page.customer_id, page.priorities) };
}

function errorResponse(e: unknown, signal: AbortSignal, limitMs: number): Response {
  let failure: AssistantFailureError;
  if (e instanceof BadRequest) failure = new AssistantFailureError("bad_request", e.message);
  else if (signal.aborted) failure = new AssistantFailureError("timeout", `The model took longer than ${limitMs / 1000} s.`);
  else if (e instanceof AssistantFailureError) failure = e;
  else {
    console.error("assistant: unexpected error", e);
    failure = new AssistantFailureError("model_error", "The assistant failed to answer. Try again.");
  }
  const body: AssistantError = { error: { code: failure.code, message: failure.message } };
  return Response.json(body, { status: ERROR_STATUS[failure.code] });
}
