// The Overview's priority blocks as display text in the app language (#28). The figures are the page data's runKpi
// answers. This module only formats and translates them. Caveats stay English, as the spec sets.

import type { KpiResult, SignalGroup } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, t } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { OverviewPage } from "../../lib/pages/overview.ts";
import { formatValue } from "./tile-cards.ts";

export interface BlockFigure {
  label: string;
  value: string;
  /** Empty for a share, whose value carries the % sign. */
  unit: string;
  data_status: string;
  /** The baseline a saving is compared with, for the handprint KPIs. */
  baseline: string | null;
  /** The KPI's caveats, in English. */
  caveats: string[];
}

export interface GroupCard {
  name: string;
  lever: string;
  owner: string;
  /** The Sites of the group's fired results, each once, in result order. */
  sites: string[];
}

export interface BlockCard {
  position: number;
  /** The priority's name. */
  name: string;
  figures: BlockFigure[];
  /** The top fired signal group that matches the priority, or null. */
  signal_group: GroupCard | null;
  /** The text in place of a signal group, when the block has none. */
  no_signal: string | null;
}

/**
 * The priority blocks in priority order. A Withheld answer has no figure, and a block whose answers are all Withheld
 * does not show. A block whose KPIs are all on the common row still shows its signal group.
 */
export function blockCards(lang: Lang, page: OverviewPage, meta: Metadata): BlockCard[] {
  const shown = page.priority_blocks.filter((b) => b.answers.length === 0 || b.answers.some((a) => !("withheld" in a)));
  return shown.map((block) => {
    const priority = meta.priorities.find((p) => p.id === block.priority_id);
    const group = page.block_signal_groups.find((g) => g.signal_id === block.signal_group_signal_id);
    const signal = group && meta.signals.find((s) => s.id === group.signal_id);
    return {
      position: block.position,
      name: dataLabel(lang, priority?.name ?? block.priority_id),
      figures: block.answers
        .filter((a): a is KpiResult => !("withheld" in a))
        .map((result) => kpiFigure(lang, result)),
      signal_group: group && signal ? groupCard(lang, group, meta) : null,
      no_signal: group ? null : t(lang, "No fired signal for this priority."),
    };
  });
}

/** A KPI result as display text: its name, value, unit, data status, baseline and caveats. */
export function kpiFigure(lang: Lang, result: KpiResult): BlockFigure {
  return {
    label: dataLabel(lang, result.name),
    ...formatValue(lang, result),
    data_status: dataLabel(lang, result.data_status),
    baseline: result.detail?.kind === "handprint" ? dataLabel(lang, result.detail.baseline_label) : null,
    caveats: [...result.caveats],
  };
}

/** A signal group as display text: the signal's name, the lever, its owner and the Sites of the fired results. */
export function groupCard(lang: Lang, group: SignalGroup, meta: Metadata): GroupCard {
  const signal = meta.signals.find((s) => s.id === group.signal_id);
  return {
    name: dataLabel(lang, signal?.name ?? group.signal_id),
    lever: dataLabel(lang, group.lever),
    owner: t(lang, "Owner: {x}", { x: dataLabel(lang, `${group.lever_owner}_owner`) }),
    sites: [...new Set(group.results.map((r) => r.site_id))].map((id) => meta.sites.find((s) => s.site_id === id)?.site_name ?? id),
  };
}
