// Improvement period comparisons (#10).

import type { CatalogueEntry, DataTransparencyNote, Month, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

export type ComparisonId =
  | "improvement_on_time_service_cycles"
  | "improvement_service_requests"
  | "improvement_scan_coverage";

/** The comparison period a KPI value is set against. Never a baseline, which is a washing alternative. */
export type CompareTo = "previous_period" | "h2_vs_h1" | "none";

export type ComparisonLabel = "better" | "worse" | "no_clear_change" | "not_evaluated";

/** A period comparison of the Improvement evidence area. */
export interface ImprovementCatalogueEntry extends CatalogueEntry {
  /** Site results are KAM view only; Customer results follow `view`. */
  site_view: "KAM";
  threshold_data_status: "TEAM_ASSUMPTION";
  rationale: string;
  /** The id of the KPI compared, in service-kpis.json. */
  kpi_id: "on_time_service_cycle_share" | "service_requests_per_100_wearers" | "scan_coverage";
  better_when: "higher" | "lower";
  /** "count_test": a two-sided exact test at the test level. "points_threshold": the scan coverage threshold. */
  judged_by: "count_test" | "points_threshold";
  /** The key in `defaults` that holds this comparison's guard. */
  minimum_volume_parameter: keyof ImprovementDefaults;
  /** The default guard, counted on the denominator in each period. */
  minimum_volume: number;
}

/** Override parameters of the Improvement tool, all TEAM_ASSUMPTION. */
export interface ImprovementDefaults {
  test_level: number;
  scan_coverage_threshold_points: number;
  minimum_sampled_cycles: number;
  minimum_wearer_months: number;
  minimum_allocated_pieces_monthly_average: number;
}

export interface CompareToConvention {
  values: { value: CompareTo; definition: string }[];
  /** All of 2025 defaults to h2_vs_h1 ("within 2025"); a shorter period to previous_period. */
  default_rule: { selected_period: string; compare_to: CompareTo; label: string | null; text: string }[];
  /** Comparisons the data cannot give, with the answer to return. */
  not_available: { request: string; answer: string }[];
  h1_months: Month[];
  h2_months: Month[];
  change_figures_ruled_out: string[];
}

/** One side of a comparison: the KPI value, the guard volume and the counts behind them. */
export interface ComparisonSide {
  /** For example "H2 2025". */
  name: string;
  /** Shares as fractions, service requests per 100 wearers per month as a number. null with no data. */
  value: number | null;
  /** Sampled cycles, wearer-months or monthly average allocated pieces, following the comparison. */
  volume: number;
  /** late_cycles and sampled_cycles, service_requests and wearer_months, or active_assets_scanned and allocated_pieces. */
  counts: Record<string, number>;
}

export interface ComparisonResult {
  comparison_id: ComparisonId;
  scope: "customer" | "site";
  scope_id: string;
  customer_id: string;
  /** "KAM" for a Site result, "Both" for a Customer result. */
  view: View;
  period: ComparisonSide;
  comparison_period: ComparisonSide;
  /** Period value minus comparison period value, in the KPI's unit. */
  change: number | null;
  /** change divided by the comparison period value. null when that value is 0. */
  relative_change: number | null;
  label: ComparisonLabel;
  not_evaluated_reason: string | null;
  /** The count test p-value. null for scan coverage and for not evaluated results. */
  p_value: number | null;
  caveats: string[];
}

export interface CustomerComparison {
  comparison_id: ComparisonId;
  customer_id: string;
  customer_result: ComparisonResult;
  /** Ordered worse, better, no clear change, not evaluated; then by the size of the relative change. */
  site_results: ComparisonResult[];
}

/** The default comparison of the data year: H2 against H1, "within 2025". */
export interface ImprovementResults {
  selected_period: string;
  compare_to: CompareTo;
  label: string;
  period: { name: string; months: Month[] };
  comparison_period: { name: string; months: Month[] };
  comparisons: CustomerComparison[];
}

export interface PeriodComparisons {
  defaults: ImprovementDefaults;
  compare_to: CompareToConvention;
  results: ImprovementResults;
  data_transparency_notes: DataTransparencyNote[];
}

export function getPeriodComparisons(): ProcessedFile<PeriodComparisons, ImprovementCatalogueEntry> {
  return readProcessed<PeriodComparisons, ImprovementCatalogueEntry>("period-comparisons");
}
