// The Opportunities page as display text in the app language (#31): the signal group cards, the proposed next steps
// and the note that signals judge all of 2025. The groups and gaps are the page data's stored signal results. This
// module only formats and translates them.

import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber, t } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { OpportunitiesPage } from "../../lib/pages/opportunities.ts";

export interface GroupCard {
  key: string;
  /** The group's rank, from 1. */
  position: number;
  /** The signal's name. */
  name: string;
  lever: string;
  owner: string;
  /** The Sites of the fired results, each once with its largest gap to the Customer's other Sites, largest first. */
  sites: { name: string; gap: string }[];
}

export interface StepCard {
  key: string;
  position: number;
  lever: string;
  owner: string;
  /** The Sites the step is for, as one line. */
  sites: string;
  /** The "proposed, to be agreed in the meeting" mark. */
  status: string;
}

export interface OpportunityCards {
  groups: GroupCard[];
  steps: StepCard[];
  /** The text in place of the groups when none fired, else null. */
  empty: string | null;
  /** Signals judge all of 2025, whatever the period. */
  note: string;
}

/** The Opportunities page's cards for the page data. */
export function opportunityCards(lang: Lang, page: OpportunitiesPage, meta: Metadata): OpportunityCards {
  const siteName = (id: string) => meta.sites.find((s) => s.site_id === id)?.site_name ?? id;
  const owner = (lever_owner: string) => t(lang, "Owner: {x}", { x: dataLabel(lang, `${lever_owner}_owner`) });
  return {
    groups: page.signal_groups.map((g) => {
      // Results are by gap, largest first, so the first result at a Site holds its largest gap.
      const sites = new Map<string, number>();
      for (const r of g.results) if (!sites.has(r.site_id)) sites.set(r.site_id, r.gap);
      return {
        key: g.signal_id,
        position: g.rank,
        name: dataLabel(lang, meta.signals.find((s) => s.id === g.signal_id)?.name ?? g.signal_id),
        lever: dataLabel(lang, g.lever),
        owner: owner(g.lever_owner),
        sites: [...sites].map(([id, gap]) => ({
          name: siteName(id),
          gap: formatNumber(lang, gap, { style: "percent", maximumFractionDigits: 0, signDisplay: "always" }),
        })),
      };
    }),
    steps: page.proposed_next_steps.map((s) => ({
      key: s.signal_id,
      position: s.position,
      lever: dataLabel(lang, s.lever),
      owner: owner(s.lever_owner),
      sites: t(lang, "Sites: {x}", { x: [...new Set(s.results.map((r) => siteName(r.site_id)))].join(", ") }),
      status: dataLabel(lang, s.status_text),
    })),
    empty: page.signal_groups.length === 0 ? t(lang, "No fired signals.") : null,
    note: t(lang, "Signals judge all of 2025."),
  };
}
