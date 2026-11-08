// The dashboard's page state (#26): the Customer, Site filter, period, view and priority list that every page
// request carries. The priority list is client state only and is never stored (#13). An assistant priority change
// (#35) keeps the list from before it, so the KAM can undo it.

import type { CustomerPriorityId, Period } from "../lib/data.ts";
import type { Metadata } from "../lib/pages/metadata.ts";
import type { PageRequest } from "../lib/pages/request.ts";

export interface PageState {
  customer_id: string;
  /** The Site filter, or null for the whole Customer. */
  site_id: string | null;
  period: Period;
  view: "KAM" | "Customer";
  priorities: CustomerPriorityId[];
  /**
   * The priority list from before the assistant's last change, while "Priorities changed by the assistant. Undo."
   * shows. Null when the assistant has not changed the list, or the user has changed it in the editor since.
   */
  undo_priorities: CustomerPriorityId[] | null;
}

export type PageAction =
  | { type: "customer"; customer: Metadata["customers"][number] }
  | { type: "site"; site_id: string | null }
  | { type: "period"; period: Period }
  | { type: "view"; view: PageState["view"] }
  /** A change made in the priority editor. */
  | { type: "priorities"; priorities: CustomerPriorityId[] }
  /** A reply's priority_change. `from` is the list the request carried, which the server built the change from. */
  | { type: "assistant_priorities"; priorities: CustomerPriorityId[]; from: CustomerPriorityId[] }
  | { type: "undo" };

/**
 * The state after an action. Before the first Customer, the state is null. A Customer switch loads that
 * Customer's default priorities and clears the Site filter. A view switch keeps the priorities. An assistant
 * priority change keeps the list before it for Undo, and an editor change or a Customer switch drops that list. An
 * assistant change built from a list that was edited while the request ran is dropped, so the edit stays.
 */
export function pageState(state: PageState | null, action: Extract<PageAction, { type: "customer" }>): PageState;
export function pageState(state: PageState, action: PageAction): PageState;
export function pageState(state: PageState | null, action: PageAction): PageState | null;
export function pageState(state: PageState | null, action: PageAction): PageState | null {
  if (action.type === "customer") {
    return {
      customer_id: action.customer.customer_id,
      site_id: null,
      period: state?.period ?? "2025",
      view: state?.view ?? "KAM",
      priorities: [...action.customer.default_priorities],
      undo_priorities: null,
    };
  }
  if (state === null) return null;
  switch (action.type) {
    case "site":
      return { ...state, site_id: action.site_id };
    case "period":
      return { ...state, period: action.period };
    case "view":
      return { ...state, view: action.view };
    case "priorities":
      return { ...state, priorities: [...action.priorities], undo_priorities: null };
    case "assistant_priorities":
      if (action.from.join() !== state.priorities.join()) return state;
      return { ...state, priorities: [...action.priorities], undo_priorities: state.priorities };
    case "undo":
      return state.undo_priorities === null ? state : { ...state, priorities: state.undo_priorities, undo_priorities: null };
  }
}

/** The body of a page data route for the state. */
export function pageRequest(state: PageState): PageRequest {
  const request: PageRequest = {
    customer_id: state.customer_id,
    period: state.period,
    view: state.view,
    priorities: state.priorities,
  };
  if (state.site_id !== null) request.site_id = state.site_id;
  return request;
}
