// The route contract between the dashboard and the AI assistant (#15). The dashboard's modal and the assistant's
// route handlers both import these types, so neither side keeps a copy. Each route returns one JSON body, with no
// streaming. A failure returns a non-2xx status with an AssistantError.

import type { CustomerPriorityId, KpiAnswer, Period, SignalGroup } from "../data.ts";

/** The body of POST /api/assistant. Each prompt stands alone, with no earlier messages. */
export interface AssistantRequest {
  prompt: string;
  customer_id: string;
  /** Must belong to customer_id, else the route answers bad_request. */
  site_id?: string;
  period: Period;
  /** Set from the dashboard's view toggle. The server passes it to every calculation call. */
  view: "KAM" | "Customer";
  /** The current Customer priorities, in order. */
  priorities: CustomerPriorityId[];
}

/** The body of POST /api/observations. */
export type ObservationsRequest = Omit<AssistantRequest, "prompt">;

/** The full new order of the Customer priorities, already checked by the server. */
export interface PriorityChange {
  priorities: CustomerPriorityId[];
}

/** The reply of POST /api/assistant. */
export interface AssistantAnswer {
  answer: string;
  /**
   * Every KpiResult or Withheld the tools returned, each kpi_id, scope and period once. The dashboard shows each
   * one's data status, baseline and caveats, and a Withheld one as "KAM view only".
   */
  sources: KpiAnswer[];
  signal_groups: SignalGroup[];
  priority_change: PriorityChange | null;
  /** Numbers in the answer text that match no value in sources. The dashboard warns when it is not empty. */
  unmatched_numbers: string[];
}

/** One AI observation. */
export interface Observation {
  text: string;
  sources: KpiAnswer[];
  signal_groups: SignalGroup[];
  unmatched_numbers: string[];
}

/** The reply of POST /api/observations. Each click of "Generate observations" replaces the earlier ones. */
export interface ObservationsReply {
  observations: Observation[];
}

/**
 * - bad_request (400): a missing field, an unknown Customer, or a Site that belongs to another Customer.
 * - model_unavailable (503): Ollama is not running or the model is not pulled.
 * - timeout (504): over the time limit.
 * - model_error (502): the model returned no answer or broken tool calls.
 */
export type AssistantErrorCode = "bad_request" | "model_unavailable" | "timeout" | "model_error";

/** What went wrong. The dashboard shows the message with "Try again". */
export interface AssistantFailure {
  code: AssistantErrorCode;
  message: string;
}

/** The body of a non-2xx reply from either route. */
export interface AssistantError {
  error: AssistantFailure;
}

/** The 6 prompts of the workbook's Suggested_Prompts sheet, in sheet order. They stay English in every language. */
export const SUGGESTED_PROMPTS = [
  "Show the value created for NorthStar Foods Group in 2025.",
  "Focus on water and emissions for the food-industry sites.",
  "Which sites have the greatest textile-allocation optimization potential?",
  "How can we improve our performance next year?",
  "Compare our circular service with local laundry.",
  "Prepare five discussion points for the annual steering committee.",
] as const;
