// The Opportunities page data (#31): the signal groups in rank order, then the proposed next steps. Signals judge
// all of 2025, as stored, whatever the request period.

import type { ProposedNextStep, SignalGroup } from "../data.ts";
import { proposedNextSteps, signalGroups } from "../data.ts";
import type { PageRequest } from "./request.ts";

export interface OpportunitiesPage {
  /** The fired signal groups in the view, ranked by the priorities, then by gap (ADR 0008). They judge all of 2025. */
  signal_groups: SignalGroup[];
  /** The top 3 groups' levers, or fewer, each with its owner and the "proposed" status. */
  proposed_next_steps: ProposedNextStep[];
  /** The fired results across the groups: the Optimisation potential count, which the menu shows. */
  fired_count: number;
}

/**
 * The Opportunities page for the request's Customer, view and priorities. With a Site filter, the groups and next
 * steps hold only the fired results at that Site, ranked by that Site's gaps.
 */
export function opportunitiesPage({ customer_id, site_id, view, priorities }: PageRequest): OpportunitiesPage {
  const query = { customer_id, site_id, view, priorities };
  const signal_groups = signalGroups(query);
  return {
    signal_groups,
    proposed_next_steps: proposedNextSteps(query),
    fired_count: signal_groups.reduce((total, g) => total + g.fired_count, 0),
  };
}
