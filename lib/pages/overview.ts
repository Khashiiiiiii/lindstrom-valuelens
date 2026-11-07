// The Overview page data (#26, #27, #28): the first screen for the request, the change badges, the on-time gauge's
// thresholds, the signal groups the priority blocks name and the KAM view's 2 charts. Every figure is a runKpi
// answer or a value from data/processed (ADR 0001). The donut's arc lengths are worked out here, on the server, so
// the client computes nothing from a figure.

import type { ComparisonPeriods, FirstScreenResult, HealthThresholds, KpiAnswer, KpiQuery, Month, SignalGroup } from "../data.ts";
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

/** The KAM view's 2 charts. */
export interface KamCharts {
  /** The waste route split for the request period. */
  textile_waste_by_treatment_route: KpiAnswer;
  /**
   * Each route's part of the route split's value, for the donut's arc lengths, in breakdown order. Empty when the
   * split is Withheld, not evaluated or 0. The dashboard draws these and never prints them.
   */
  textile_waste_route_arcs: { key: string; fraction: number }[];
  /** The stage medians of each data month, in month order. in_period marks the months of the request period. */
  turnaround_by_stage: { month: Month; in_period: boolean; answer: KpiAnswer }[];
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
  kam_charts: KamCharts | null;
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
  const block_signal_groups = signalGroups({ customer_id, site_id, view, priorities: screen.priority_ids }).filter((g) =>
    blockSignalIds.has(g.signal_id),
  );
  return {
    ...screen,
    change_badges,
    on_time_thresholds: view === "KAM" ? { ...getAccountHealth().data.defaults.account_health_on_time_service_cycle_share } : null,
    block_signal_groups,
    kam_charts: view === "KAM" ? kamCharts({ scope, period, view }) : null,
  };
}

/** The waste route split and its arcs for the query period, and turnaround by stage for every data month. */
function kamCharts(query: KpiQuery): KamCharts {
  const waste = runKpi("textile_waste_by_treatment_route", query);
  const inPeriod = new Set(periodMonths(query.period));
  return {
    textile_waste_by_treatment_route: waste,
    textile_waste_route_arcs: routeArcs(waste),
    turnaround_by_stage: getMasterData().data.months.map((month) => ({
      month,
      in_period: inPeriod.has(month),
      answer: runKpi("turnaround_by_stage", { ...query, period: month }),
    })),
  };
}

/** Each route's kg over the split's total, or none when the split is Withheld, not evaluated or 0. */
function routeArcs(answer: KpiAnswer): { key: string; fraction: number }[] {
  if ("withheld" in answer || !answer.value || answer.breakdown === null) return [];
  const total = answer.value;
  return answer.breakdown.map((b) => ({ key: b.key, fraction: b.value / total }));
}
