// A monthly series as chart values (#27). The sparklines and the monthly trend chart both read a series through
// chartSeries, so they apply the same rule: a Withheld first point means the chart does not show.

import type { Lang } from "../../lib/i18n.ts";
import { dataLabel } from "../../lib/i18n.ts";
import type { MonthlySeries } from "../../lib/pages/series.ts";

export interface ChartSeries {
  kpi_id: string;
  /** The KPI name and unit, from the first point. */
  name: string;
  unit: string;
  /** The value in each data month, with null for a month not evaluated or Withheld. */
  values: (number | null)[];
}

/** The series as chart values, or null when it has no points or its first point is Withheld. */
export function chartSeries(series: MonthlySeries): ChartSeries | null {
  const first = series.points[0];
  if (first === undefined || "withheld" in first) return null;
  return {
    kpi_id: series.kpi_id,
    name: first.name,
    unit: first.unit,
    values: series.points.map((p) => ("withheld" in p ? null : p.value)),
  };
}

/** A KPI option of the monthly trend chart, with its texts in the app language. */
export interface TrendOption extends ChartSeries {
  /** The KPI name in the language. */
  label: string;
  /** The unit after each month's value in the point titles. It is empty for a share or a month with no value. */
  point_units: string[];
}

/** The trend chart's KPI options: each series with a value in 1 month or more. */
export function trendOptions(lang: Lang, series: MonthlySeries[]): TrendOption[] {
  return series
    .map(chartSeries)
    .filter((s): s is ChartSeries => s !== null && s.values.some((v) => v !== null))
    .map((s) => ({
      ...s,
      label: dataLabel(lang, s.name),
      point_units: s.values.map((v) => (v === null || s.unit === "share" ? "" : dataLabel(lang, s.unit, v))),
    }));
}
