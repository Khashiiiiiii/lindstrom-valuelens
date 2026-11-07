// The Overview's 9 common tiles as display text in the app language (#26, #27). The figures, badges and sparkline
// points are the page data's runKpi answers. This module only formats and translates them. Caveats stay English, as
// the spec sets.

import type { KpiResult } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber, monthName, t } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { ChangeBadge, OverviewPage } from "../../lib/pages/overview.ts";
import type { SeriesPage } from "../../lib/pages/series.ts";
import { chartSeries } from "./chart-series.ts";

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
  /**
   * The KPI's value in each data month, with null for a month not evaluated. The sparkline is null until the series
   * loads, and also when the series is Withheld.
   */
  sparkline: (number | null)[] | null;
}

/** A period comparison label. Green means Improved and red means Worse. */
export interface TileBadge {
  label: string;
  tone: "good" | "bad" | "neutral";
  /** What the badge compares, for example "March 2025 compared with February 2025". null with no comparison period. */
  compared: string | null;
  /** The comparison result's caveats, in English. A Site result carries the chance caveat (ADR 0010). */
  caveats: string[];
}

export interface TileCard {
  id: string;
  name: string;
  figures: TileFigure[];
  notes: string[];
  /** Only the tiles with a period comparison have a badge. It is null when the comparison is Withheld. */
  badge: TileBadge | null;
}

/** What the tiles are built from. series is null until the monthly series loads. */
export interface TileData {
  page: OverviewPage;
  meta: Metadata;
  /** The Site filter, or null for the whole Customer. */
  site_id: string | null;
  series: SeriesPage | null;
}

/**
 * The common tiles in their fixed order. A Withheld answer has no figure, and a tile whose answers are all Withheld
 * does not show.
 */
export function tileCards(lang: Lang, { page, meta, site_id, series }: TileData): TileCard[] {
  const shown = page.tiles.filter((tile) => tile.answers.length === 0 || tile.answers.some((a) => !("withheld" in a)));
  return shown.map((tile) => {
    const change = page.change_badges.find((b) => b.tile_id === tile.id);
    const card: TileCard = {
      id: tile.id,
      name: dataLabel(lang, tile.name),
      figures: [],
      notes: [],
      badge: change === undefined ? null : badge(lang, change),
    };
    if (tile.id === "site_count") {
      const counted = meta.sites.filter((s) => site_id === null || s.site_id === site_id);
      card.figures.push({
        label: null,
        value: formatNumber(lang, page.site_count),
        unit: t(lang, "Sites_unit", { n: page.site_count }),
        data_status: statusLabel(lang, counted.map((s) => s.data_status)),
        baseline: null,
        caveats: [],
        sparkline: null,
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
        sparkline: null,
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
        sparkline: sparkline(series, result.kpi_id),
      });
    }
    return card;
  });
}

/** The badge's comparison label, or null when it is Withheld. A result with no comparison is not evaluated. */
function badge(lang: Lang, { comparison: answer, periods }: ChangeBadge): TileBadge | null {
  if ("withheld" in answer) return null;
  const comparison = answer.detail?.kind === "period_comparison" ? answer.detail.comparison : null;
  const label = comparison?.label ?? "not_evaluated";
  return {
    label: dataLabel(lang, label),
    tone: label === "better" ? "good" : label === "worse" ? "bad" : "neutral",
    compared:
      periods === null
        ? null
        : capitalise(t(lang, "{p} compared with {c}", { p: sideName(lang, periods.period), c: sideName(lang, periods.comparison_period) })),
    caveats: comparison ? [...comparison.caveats] : [],
  };
}

/** A comparison side's name: a month in the language, or a half-year name such as "H1 2025", which every language uses. */
function sideName(lang: Lang, side: { name: string; months: string[] }): string {
  return side.months.length === 1 ? `${monthName(lang, side.months[0])} ${side.months[0].slice(0, 4)}` : side.name;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The KPI's monthly values, or null when the series is not loaded, missing or Withheld from its first point. */
function sparkline(series: SeriesPage | null, kpi_id: string): (number | null)[] | null {
  const found = series?.series.find((s) => s.kpi_id === kpi_id);
  return found === undefined ? null : (chartSeries(found)?.values ?? null);
}

/** The value and unit as display text. A share shows as a percentage. A value not evaluated says so. */
export function formatValue(lang: Lang, result: KpiResult): { value: string; unit: string } {
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
