// The failures of an assistant route after the request is parsed (#15). A bad request is a BadRequest from
// lib/pages/request.ts; everything the model side can fail with is an AssistantFailureError.

import type { AssistantErrorCode } from "./contract.ts";

export const ERROR_STATUS: Record<AssistantErrorCode, number> = {
  bad_request: 400,
  model_error: 502,
  model_unavailable: 503,
  timeout: 504,
};

/** A failure the route returns as an AssistantError body with ERROR_STATUS[code]. */
export class AssistantFailureError extends Error {
  readonly code: AssistantErrorCode;
  constructor(code: AssistantErrorCode, message: string) {
    super(message);
    this.name = "AssistantFailureError";
    this.code = code;
  }
}
