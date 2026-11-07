// The Overview page data (#26, #27, #28): the first screen for the request, the change badges, the on-time gauge's
// thresholds, the signal groups the priority blocks name and the KAM view's 2 charts. Every figure is a runKpi
// answer or a value from data/processed (ADR 0001).

import type { ComparisonPeriods, FirstScreenResult, HealthThresholds, KpiAnswer, Month, SignalGroup } from "../data.ts";
import {
  comparisonPeriods,
  firstScreen,
  getAccountHealth,
  getMasterData,
  getPeriodComparisons,
  periodMonths,
  runKpi,
  signalGroups,
} from "../data.ts";
import type { PageRequest } from "./request.ts";
import { pageScope } from "./request.ts";

/** A common tile's change badge: the period comparison of the tile's KPI with the default compare_to. */
export interface ChangeBadge {
  tile_id: string;
  /** Withheld for a Site in the Customer view (ADR 0011). The label is in detail.comparison. */
  comparison: KpiAnswer;
  /** The months compared, for the badge text. null when the comparison is Withheld or has no comparison period. */
  periods: ComparisonPeriods | null;
}

export interface OverviewPage extends FirstScreenResult {
  /**
   * One badge per common tile whose KPI has a period comparison, in tile order: On-time service cycle share and
   * Service requests per 100 wearers. No other tile has a badge, and no relative change is computed (ADR 0010).
   */
  change_badges: ChangeBadge[];
  /** The account health thresholds of on-time service cycle share, for the gauge. KAM view only, else null (ADR 0009). */
  on_time_thresholds: HealthThresholds | null;
  /**
   * The signal groups the priority blocks name, each once, in rank order. Under a Site filter a group keeps only its
   * results at that Site.
   */
  block_signal_groups: SignalGroup[];
  /** KAM view only, else null. */
  kam_charts: {
    /** The waste route split for the request period. */
    textile_waste_by_treatment_route: KpiAnswer;
    /** The stage medians of each data month, in month order. in_period marks the months of the request period. */
    turnaround_by_stage: { month: Month; in_period: boolean; answer: KpiAnswer }[];
  } | null;
}

/**
 * The first screen for the request's Customer, Site, period, view and priorities, with the badges, the gauge
 * thresholds, the blocks' signal groups and the KAM view's charts.
 */
export function overviewPage(request: PageRequest): OverviewPage {
  const screen = firstScreen(request);
  const { customer_id, site_id, period, view } = request;
  const scope = pageScope(request);
  const comparisons = getPeriodComparisons().catalogue;
  const sides = comparisonPeriods({ scope, period, view });
  const change_badges = screen.tiles.flatMap((tile): ChangeBadge[] => {
    const entry = comparisons.find((c) => tile.kpi_ids.length === 1 && c.kpi_id === tile.kpi_ids[0]);
    if (!entry) return [];
    const comparison = runKpi(entry.id, { scope, period, view });
    const periods = "withheld" in comparison || "reason" in sides ? null : sides;
    return [{ tile_id: tile.id, comparison, periods }];
  });
  const blockSignalIds = new Set(screen.priority_blocks.map((b) => b.signal_group_signal_id));
  const block_signal_groups = signalGroups({ customer_id, view, priorities: screen.priority_ids })
    .filter((g) => blockSignalIds.has(g.signal_id))
    .map((g) => ({ ...g, results: g.results.filter((r) => site_id === undefined || r.site_id === site_id) }));
  const inPeriod = new Set(periodMonths(period));
  return {
    ...screen,
    change_badges,
    on_time_thresholds: view === "KAM" ? { ...getAccountHealth().data.defaults.account_health_on_time_service_cycle_share } : null,
    block_signal_groups,
    kam_charts:
      view === "KAM"
        ? {
            textile_waste_by_treatment_route: runKpi("textile_waste_by_treatment_route", { scope, period, view }),
            turnaround_by_stage: getMasterData().data.months.map((month) => ({
              month,
              in_period: inPeriod.has(month),
              answer: runKpi("turnaround_by_stage", { scope, period: month, view }),
            })),
          }
        : null,
  };
}
