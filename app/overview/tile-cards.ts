// The Overview's 9 common tiles as display text in the app language (#26). The figures are the page data's runKpi
// answers. This module only formats and translates them. Caveats stay English, as the spec sets.

import type { KpiResult } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber, t } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { OverviewPage } from "../../lib/pages/overview.ts";

export interface TileFigure {
  /** The KPI name, on a tile with more than one KPI. */
  label: string | null;
  value: string;
  /** Empty for a share, whose value carries the % sign. */
  unit: string;
  data_status: string;
  /** The baseline a saving is compared with, for the handprint KPIs. */
  baseline: string | null;
  caveats: string[];
}

export interface TileCard {
  id: string;
  name: string;
  figures: TileFigure[];
  notes: string[];
}

/**
 * The common tiles in their fixed order, for the Site filter or null. A Withheld answer has no figure, and a tile
 * whose answers are all Withheld does not show.
 */
export function tileCards(lang: Lang, page: OverviewPage, meta: Metadata, site_id: string | null): TileCard[] {
  const shown = page.tiles.filter((tile) => tile.answers.length === 0 || tile.answers.some((a) => !("withheld" in a)));
  return shown.map((tile) => {
    const card: TileCard = { id: tile.id, name: dataLabel(lang, tile.name), figures: [], notes: [] };
    if (tile.id === "site_count") {
      const counted = meta.sites.filter((s) => site_id === null || s.site_id === site_id);
      card.figures.push({
        label: null,
        value: formatNumber(lang, page.site_count),
        unit: t(lang, "Sites_unit", { n: page.site_count }),
        data_status: statusLabel(lang, counted.map((s) => s.data_status)),
        baseline: null,
        caveats: [],
      });
    } else if (tile.id === "optimisation_potential") {
      const { fired_count, signal_count, top_signal_group_signal_id } = page.optimisation_potential;
      const top = meta.signals.find((s) => s.id === top_signal_group_signal_id);
      card.figures.push({
        label: null,
        value: formatNumber(lang, fired_count),
        unit: t(lang, "fired results across {n} signals", { n: signal_count }),
        data_status: statusLabel(lang, meta.signals.map((s) => s.data_status)),
        baseline: null,
        caveats: [],
      });
      if (top) card.notes.push(t(lang, "Top: {x}", { x: dataLabel(lang, top.name) }));
      card.notes.push(t(lang, "Signals judge all of 2025."));
    }
    const results = tile.answers.filter((a): a is KpiResult => !("withheld" in a));
    for (const result of results) {
      card.figures.push({
        label: tile.answers.length > 1 ? dataLabel(lang, result.name) : null,
        ...formatValue(lang, result),
        data_status: dataLabel(lang, result.data_status),
        baseline: result.detail?.kind === "handprint" ? dataLabel(lang, result.detail.baseline_label) : null,
        caveats: (tile.caveats ?? []).filter((c) => c.kpi_id === result.kpi_id).map((c) => c.caveat),
      });
    }
    return card;
  });
}

/** The value and unit as display text. A share shows as a percentage. A value not evaluated says so. */
function formatValue(lang: Lang, result: KpiResult): { value: string; unit: string } {
  if (result.value === null) return { value: dataLabel(lang, "not_evaluated"), unit: "" };
  if (result.unit === "share") {
    return { value: formatNumber(lang, result.value, { style: "percent", maximumFractionDigits: 1 }), unit: "" };
  }
  const digits = Math.abs(result.value) >= 100 ? 0 : 2;
  return { value: formatNumber(lang, result.value, { maximumFractionDigits: digits }), unit: dataLabel(lang, result.unit, result.value) };
}

/** The data statuses of the rows behind a figure, each once, as one label. */
function statusLabel(lang: Lang, values: string[]): string {
  return [...new Set(values)].map((s) => dataLabel(lang, s)).join(", ");
}
