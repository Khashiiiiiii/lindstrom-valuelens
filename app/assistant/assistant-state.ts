// The assistant modal's client state (#34, #35): whether the modal is open and on which tab, the one request that
// may run, the last prompt with its answer or error, and the last observations or their error. Each prompt stands
// alone, so a new prompt replaces the last answer, and each "Generate observations" replaces the last observations.

import type { AssistantAnswer, AssistantFailure, Observation } from "../../lib/assistant/contract.ts";
import type { CustomerPriorityId } from "../../lib/data.ts";
import type { PageState } from "../page-state.ts";

/** The modal's two tabs: Ask, with the prompt box, and Observations, with "Generate observations". */
export type AssistantTab = "ask" | "observations";

/** The two kinds of request: a prompt from the Ask tab, or "Generate observations". */
export type RequestKind = "ask" | "observe";

/** The Customer and view that the answers and observations belong to. */
export type AssistantScope = Pick<PageState, "customer_id" | "view">;

export interface AssistantState {
  open: boolean;
  tab: AssistantTab;
  /** The last prompt sent. It shows as the asker's bubble, and "Try again" sends it again. */
  prompt: string | null;
  /** The priority list the last prompt was sent with. The server built the answer's priority_change from it. */
  asked_priorities: CustomerPriorityId[] | null;
  /** The request that runs, or null. There is at most one, a prompt or a "Generate observations". */
  pending: { kind: RequestKind; request_id: number; started_at: number } | null;
  answer: AssistantAnswer | null;
  /** Null until the first "Generate observations" reply. They never load with the page. */
  observations: Observation[] | null;
  /** The last error of each kind of request. Each tab shows its own, so an observations error keeps the answer. */
  errors: Record<RequestKind, AssistantFailure | null>;
  /** A reply arrived while the modal was closed. The AI button shows a dot until the modal opens. */
  unread: boolean;
  /** The scope of the answer and observations, or null before the first scope action. */
  scope: AssistantScope | null;
}

export type AssistantAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "tab"; tab: AssistantTab }
  /** request_id names the request, so a reply to it can be matched. at is the time in ms. */
  | { type: "ask"; prompt: string; priorities: CustomerPriorityId[]; request_id: number; at: number }
  | { type: "observe"; request_id: number; at: number }
  | { type: "answer"; request_id: number; answer: AssistantAnswer }
  | { type: "observations"; request_id: number; observations: Observation[] }
  | { type: "failed"; request_id: number; error: AssistantFailure }
  /** The page's Customer and view. A change clears the answer and observations and drops the pending request. */
  | ({ type: "scope" } & AssistantScope);

/** The state before the first request. */
export const INITIAL: AssistantState = {
  open: false,
  tab: "ask",
  prompt: null,
  asked_priorities: null,
  pending: null,
  answer: null,
  observations: null,
  errors: { ask: null, observe: null },
  unread: false,
  scope: null,
};

/**
 * The state after an action. A request while one runs, or a blank prompt, is ignored. A reply to any request but
 * the pending one is ignored, so a reply that a scope change dropped never shows.
 */
export function assistantState(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case "open":
      return { ...state, open: true, unread: false };
    case "close":
      return { ...state, open: false };
    case "tab":
      return { ...state, tab: action.tab };
    case "ask": {
      const prompt = action.prompt.trim();
      if (state.pending !== null || prompt === "") return state;
      const pending = { kind: "ask", request_id: action.request_id, started_at: action.at } as const;
      return { ...state, prompt, asked_priorities: action.priorities, pending, answer: null, errors: { ...state.errors, ask: null } };
    }
    case "observe": {
      if (state.pending !== null) return state;
      const pending = { kind: "observe", request_id: action.request_id, started_at: action.at } as const;
      return { ...state, pending, observations: null, errors: { ...state.errors, observe: null } };
    }
    case "answer":
    case "observations":
    case "failed": {
      const pending = state.pending;
      if (pending?.request_id !== action.request_id) return state;
      const replied = { ...state, pending: null, unread: !state.open };
      if (action.type === "answer") return { ...replied, answer: action.answer };
      if (action.type === "observations") return { ...replied, observations: action.observations };
      return { ...replied, errors: { ...state.errors, [pending.kind]: action.error } };
    }
    case "scope": {
      const scope = { customer_id: action.customer_id, view: action.view };
      return inScope(state, scope) ? state : { ...INITIAL, open: state.open, tab: state.tab, scope };
    }
  }
}

/** The state before the first request, for the page's Customer and view. */
export function initialState(scope: AssistantScope): AssistantState {
  return { ...INITIAL, scope: { customer_id: scope.customer_id, view: scope.view } };
}

/** Whether the answer and observations belong to this Customer and view. A switch of either clears them. */
export function inScope(state: AssistantState, scope: AssistantScope): boolean {
  return state.scope?.customer_id === scope.customer_id && state.scope.view === scope.view;
}

/** The whole seconds the pending request has run at time `now`, for the "Working... N s" counter. 0 with none. */
export function workingSeconds(state: AssistantState, now: number): number {
  return state.pending === null ? 0 : Math.max(0, Math.floor((now - state.pending.started_at) / 1000));
}
