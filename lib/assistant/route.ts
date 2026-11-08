// The POST /api/assistant handler (#40). It parses the body with the page request parsing plus a prompt, sets one
// AbortController for the whole answer and returns one JSON body. Nothing is stored between requests. With
// ASSISTANT_STUB=1 it serves the #34 stub instead, so the dashboard can be built without Ollama.

import { resolvePriorities } from "../data.ts";
import { BadRequest, parsePageRequest } from "../pages/request.ts";
import { answerPrompt } from "./answer.ts";
import type { AssistantError, AssistantRequest } from "./contract.ts";
import { AssistantFailureError, ERROR_STATUS } from "./errors.ts";
import type { Chat } from "./ollama.ts";
import { ollamaChat } from "./ollama.ts";
import { stubAnswer, stubRoute } from "./stub.ts";

export const ANSWER_TIMEOUT_MS = 90_000;
const STUB_DELAY_MS = 4000;

export interface AssistantRouteOptions {
  chat?: Chat;
  timeoutMs?: number;
}

/** The POST handler. The stub or the model is picked per request from ASSISTANT_STUB. */
export function assistantRoute({ chat = ollamaChat(), timeoutMs = ANSWER_TIMEOUT_MS }: AssistantRouteOptions = {}) {
  const stub = stubRoute(stubAnswer, STUB_DELAY_MS);
  return async (request: Request): Promise<Response> => {
    if (process.env.ASSISTANT_STUB === "1") return stub(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const parsed = parseAssistantRequest(await request.json().catch(() => null));
      return Response.json(await answerPrompt(parsed, { chat, signal: controller.signal }));
    } catch (e) {
      return errorResponse(e, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** The page request plus a prompt, with the priorities as ids. Throws BadRequest. */
export function parseAssistantRequest(body: unknown): AssistantRequest {
  const page = parsePageRequest(body);
  const prompt = (body as { prompt?: unknown }).prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") throw new BadRequest("prompt must be a non-empty string.");
  return { ...page, prompt: prompt.trim(), priorities: resolvePriorities(page.customer_id, page.priorities) };
}

function errorResponse(e: unknown, signal: AbortSignal): Response {
  let failure: AssistantFailureError;
  if (e instanceof BadRequest) failure = new AssistantFailureError("bad_request", e.message);
  else if (signal.aborted) failure = new AssistantFailureError("timeout", "The model took longer than 90 s.");
  else if (e instanceof AssistantFailureError) failure = e;
  else {
    console.error("assistant: unexpected error", e);
    failure = new AssistantFailureError("model_error", "The assistant failed to answer. Try again.");
  }
  const body: AssistantError = { error: { code: failure.code, message: failure.message } };
  return Response.json(body, { status: ERROR_STATUS[failure.code] });
}
