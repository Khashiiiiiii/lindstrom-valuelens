// The assistant modal's client state (#34): whether the modal is open, the one request that may run, and the last
// prompt with its answer or error. Each prompt stands alone, so a new prompt replaces the last answer.

import type { AssistantAnswer, AssistantFailure } from "../../lib/assistant/contract.ts";

export interface AssistantState {
  open: boolean;
  /** The last prompt sent. It shows as the asker's bubble, and "Try again" sends it again. */
  prompt: string | null;
  /** The request that runs, or null. There is at most one. */
  pending: { request_id: number; started_at: number } | null;
  answer: AssistantAnswer | null;
  error: AssistantFailure | null;
  /** A reply arrived while the modal was closed. The AI button shows a dot until the modal opens. */
  unread: boolean;
}

export type AssistantAction =
  | { type: "open" }
  | { type: "close" }
  /** request_id names the request, so a reply to it can be matched. at is the time in ms. */
  | { type: "ask"; prompt: string; request_id: number; at: number }
  | { type: "answer"; request_id: number; answer: AssistantAnswer }
  | { type: "failed"; request_id: number; error: AssistantFailure };

/** The state before the first request. */
export const INITIAL: AssistantState = { open: false, prompt: null, pending: null, answer: null, error: null, unread: false };

/**
 * The state after an action. A prompt while a request runs, or a blank prompt, is ignored. A reply to any request
 * but the pending one is ignored.
 */
export function assistantState(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case "open":
      return { ...state, open: true, unread: false };
    case "close":
      return { ...state, open: false };
    case "ask": {
      const prompt = action.prompt.trim();
      if (state.pending !== null || prompt === "") return state;
      return { ...state, prompt, pending: { request_id: action.request_id, started_at: action.at }, answer: null, error: null };
    }
    case "answer":
    case "failed": {
      if (state.pending?.request_id !== action.request_id) return state;
      const reply = action.type === "answer" ? { answer: action.answer, error: null } : { answer: null, error: action.error };
      return { ...state, ...reply, pending: null, unread: !state.open };
    }
  }
}

/** The whole seconds the pending request has run at time `now`, for the "Working... N s" counter. 0 with none. */
export function workingSeconds(state: AssistantState, now: number): number {
  return state.pending === null ? 0 : Math.max(0, Math.floor((now - state.pending.started_at) / 1000));
}
