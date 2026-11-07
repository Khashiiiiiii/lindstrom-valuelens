// The Overview page data (#26, #27): the first screen for the request, the change badges and the on-time gauge's
// thresholds. Every figure is a runKpi answer or a value from data/processed (ADR 0001).

import type { FirstScreenResult, HealthThresholds, KpiAnswer } from "../data.ts";
import { firstScreen, getAccountHealth, getPeriodComparisons, runKpi } from "../data.ts";
import type { PageRequest } from "./request.ts";

/** A common tile's change badge: the period comparison of the tile's KPI with the default compare_to. */
export interface ChangeBadge {
  tile_id: string;
  /** Withheld for a Site in the Customer view (ADR 0011). The label is in detail.comparison. */
  comparison: KpiAnswer;
}

export interface OverviewPage extends FirstScreenResult {
  /**
   * One badge per common tile whose KPI has a period comparison, in tile order: On-time service cycle share and
   * Service requests per 100 wearers. No other tile has a badge, and no relative change is computed (ADR 0010).
   */
  change_badges: ChangeBadge[];
  /** The account health thresholds of on-time service cycle share, for the gauge. KAM view only, else null (ADR 0009). */
  on_time_thresholds: HealthThresholds | null;
}

/** The first screen for the request's Customer, Site, period, view and priorities, with the badges and gauge thresholds. */
export function overviewPage(request: PageRequest): OverviewPage {
  const screen = firstScreen(request);
  const { customer_id, site_id, period, view } = request;
  const scope = site_id === undefined ? { customer_id } : { customer_id, site_id };
  const comparisons = getPeriodComparisons().catalogue;
  const change_badges = screen.tiles.flatMap((tile): ChangeBadge[] => {
    const entry = comparisons.find((c) => tile.kpi_ids.length === 1 && c.kpi_id === tile.kpi_ids[0]);
    return entry ? [{ tile_id: tile.id, comparison: runKpi(entry.id, { scope, period, view }) }] : [];
  });
  return {
    ...screen,
    change_badges,
    on_time_thresholds: view === "KAM" ? { ...getAccountHealth().data.defaults.account_health_on_time_service_cycle_share } : null,
  };
}
