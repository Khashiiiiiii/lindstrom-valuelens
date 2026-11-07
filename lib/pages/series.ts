// The monthly series page data (#27): for each KPI of the common tiles, one runKpi answer per data month. The
// sparklines and the monthly trend chart draw these points. No point is computed here (ADR 0001).

import type { KpiAnswer, Month } from "../data.ts";
import { getMasterData, getViewsAndReview, periodMonths, runKpi } from "../data.ts";
import type { PageRequest } from "./request.ts";

/** One KPI over the data year. A Withheld first point means the chart does not show. */
export interface MonthlySeries {
  kpi_id: string;
  /** One answer per data month, in month order. */
  points: KpiAnswer[];
}

export interface SeriesPage {
  /** The data months, one per point. */
  months: Month[];
  /** The months of the request period, which the trend chart highlights. */
  period_months: Month[];
  /** The KPIs of the common tiles, in tile order. */
  series: MonthlySeries[];
}

/**
 * The monthly series for the request's Customer or Site and view. Every series covers all data months whatever the
 * period. The period only sets period_months.
 */
export function seriesPage({ customer_id, site_id, period, view }: PageRequest): SeriesPage {
  const months = getMasterData().data.months;
  const scope = site_id === undefined ? { customer_id } : { customer_id, site_id };
  const kpi_ids = getViewsAndReview().data.first_screen.common_tiles.flatMap((t) => t.kpi_ids);
  return {
    months: [...months],
    period_months: periodMonths(period),
    series: kpi_ids.map((kpi_id) => ({
      kpi_id,
      points: months.map((month) => runKpi(kpi_id, { scope, period: month, view })),
    })),
  };
}
