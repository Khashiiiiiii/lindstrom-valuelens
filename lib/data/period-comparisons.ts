// Improvement period comparisons (#10).

import type { CatalogueEntry, DataTransparencyNote, Month, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiQuery, KpiResult, ResolvedScope } from "./query.ts";
import { catalogueEntry, checkBreakdown, inScope, kpiResult, notEvaluated, periodMonths, resolveScope, sum } from "./query.ts";
import { getServiceKpis } from "./service-kpis.ts";

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

// Calculations (#12, #19). A comparison is calculated from the month facts in service-kpis.json for any period, the
// way scripts/pipeline/period_comparisons.py calculates the precomputed H2 against H1 results.

const SITE_CHANCE_CAVEAT = "About 1 in 20 Sites shows a clear change by chance alone.";
const SAMPLE_CAVEAT = "Based on a sample of tracked garments.";

/** What a comparison's volume counts, and the caveats its results carry. The texts match the pipeline's. */
const RESULT_TEXT: Record<ImprovementCatalogueEntry["kpi_id"], { volume_text: string; caveats: string[] }> = {
  on_time_service_cycle_share: { volume_text: "sampled cycles", caveats: [SITE_CHANCE_CAVEAT, SAMPLE_CAVEAT] },
  service_requests_per_100_wearers: { volume_text: "wearer-months", caveats: [SITE_CHANCE_CAVEAT] },
  scan_coverage: { volume_text: "allocated pieces, monthly average", caveats: [SITE_CHANCE_CAVEAT] },
};

function entry(id: ComparisonId): ImprovementCatalogueEntry {
  return catalogueEntry(getPeriodComparisons().catalogue, "period-comparisons", id);
}

/** A named run of months, one side of a comparison. */
interface NamedMonths {
  name: string;
  months: Month[];
}

/** The selected period and the period it is compared against. */
interface ComparisonPeriods {
  period: NamedMonths;
  comparison_period: NamedMonths;
}

/** A side's name: "H1 2025", "H2 2025" or a month such as "March 2025". */
function periodName(months: Month[]): string {
  const { h1_months, h2_months } = getPeriodComparisons().data.compare_to;
  const year = months[0].slice(0, 4);
  const same = (half: Month[]) => half.length === months.length && half.every((m, i) => m === months[i]);
  if (same(h1_months)) return `H1 ${year}`;
  if (same(h2_months)) return `H2 ${year}`;
  if (months.length !== 1) throw new Error(`A comparison side is a half-year or a month, not ${months.join(", ")}.`);
  return new Date(`${months[0]}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The query's period and its comparison period, or the reason there is no comparison. compare_to defaults by
 * default_rule: H2 against H1 for all of the data year, else the previous period of the same length.
 */
function comparisonPeriods(query: KpiQuery): ComparisonPeriods | { reason: string } {
  const convention = getPeriodComparisons().data.compare_to;
  const { h1_months, h2_months } = convention;
  const all = [...h1_months, ...h2_months];
  const year = all[0].slice(0, 4);
  const months = periodMonths(query.period);
  const wholeYear = query.period === year;
  const named = (m: Month[]): NamedMonths => ({ name: periodName(m), months: m });
  const compare_to = query.compare_to ?? (wholeYear ? convention.default_rule[0] : convention.default_rule[1]).compare_to;
  if (!convention.values.some((v) => v.value === compare_to)) {
    throw new Error(`Unknown compare_to "${compare_to}". Use ${convention.values.map((v) => v.value).join(", ")}.`);
  }
  if (compare_to === "none") return { reason: "No comparison: compare_to is none." };
  if (compare_to === "h2_vs_h1") {
    if (!wholeYear && query.period !== `${year}-H2`) {
      return { reason: `H2 ${year} against H1 ${year} is for all of ${year} or H2 ${year} only.` };
    }
    return { period: named(h2_months), comparison_period: named(h1_months) };
  }
  const start = all.indexOf(months[0]);
  if (start < months.length) {
    const request = wholeYear ? "Year on year" : "Previous period of a period that starts in January";
    const answer = convention.not_available.find((n) => n.request === request);
    if (!answer) throw new Error(`period-comparisons.json has no not_available answer for "${request}".`);
    return { reason: answer.answer };
  }
  return { period: named(months), comparison_period: named(all.slice(start - months.length, start)) };
}

/**
 * Python's round(value, digits), which the pipeline uses: the nearest number with that many places, an exact tie
 * going to the even last digit. toFixed, and so round() in query.ts, sends a tie up instead.
 */
function roundLikePython(value: number, digits = 6): number {
  const [whole, fraction] = Math.abs(value).toFixed(30).split(".");
  const kept = BigInt(whole + fraction.slice(0, digits));
  const rest = fraction.slice(digits);
  const half = "5".padEnd(rest.length, "0");
  const up = rest > half || (rest === half && kept % 2n === 1n);
  const rounded = Number(up ? kept + 1n : kept) / 10 ** digits;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/**
 * One side's value, volume and counts for the scope. The month facts of the side's months are summed first, and
 * the ratio is built from the totals.
 */
function calculateSide(kpi_id: ImprovementCatalogueEntry["kpi_id"], scope: ResolvedScope, side: NamedMonths): ComparisonSide {
  const { site_month, cycles } = getServiceKpis().data;
  if (kpi_id === "on_time_service_cycle_share") {
    const rows = cycles.filter((r) => inScope(r, scope, side.months));
    const sampled = sum(rows, (r) => r.cycles);
    const late = sum(rows, (r) => r.late_cycles);
    return {
      name: side.name,
      value: sampled ? (sampled - late) / sampled : null,
      volume: sampled,
      counts: { late_cycles: late, sampled_cycles: sampled },
    };
  }
  // site_month holds active wearers by the wearer counting rule (ADR 0003), so they add up across Sites.
  const rows = site_month.filter((r) => inScope(r, scope, side.months));
  if (kpi_id === "service_requests_per_100_wearers") {
    const requests = sum(rows, (r) => r.service_requests);
    const wearer_months = sum(rows, (r) => r.active_wearers);
    return {
      name: side.name,
      value: wearer_months ? (100 * requests) / wearer_months : null,
      volume: wearer_months,
      counts: { service_requests: requests, wearer_months },
    };
  }
  const scanned = sum(rows, (r) => r.active_assets_scanned);
  const allocated = sum(rows, (r) => r.allocated_pieces);
  return {
    name: side.name,
    value: allocated ? scanned / allocated : null,
    volume: roundLikePython(allocated / side.months.length, 0),
    counts: { active_assets_scanned: scanned, allocated_pieces: allocated },
  };
}

// Exact tests on whole-number weights. BigInt keeps the binomial coefficients exact, as Python's integers do.

/** Two outcomes whose probabilities differ by less than 1 in 10**7 count as equally extreme. */
const EXTREME_TOLERANCE_PARTS = 10n ** 7n;

/** The binomial coefficients of n, from n choose 0 up to n choose upTo. */
function binomialRow(n: number, upTo: number): bigint[] {
  const row = [1n];
  for (let k = 0; k < upTo; k++) row.push((row[k] * BigInt(n - k)) / BigInt(k + 1));
  return row;
}

/** The quotient of 2 whole numbers as a float. It works when both numbers are too large for a float. */
function ratio(a: bigint, b: bigint): number {
  if (a === 0n) return 0;
  const shift = Math.max(0, b.toString(2).length - a.toString(2).length + 64);
  return Number((a << BigInt(shift)) / b) * 2 ** -shift;
}

/** The sum of the outcome weights no larger than the observed one's, over the sum of all weights. */
function twoSidedP(weights: Map<number, bigint>, observed: number): number {
  const limit = weights.get(observed)! * (EXTREME_TOLERANCE_PARTS + 1n);
  let extreme = 0n;
  let total = 0n;
  for (const w of weights.values()) {
    total += w;
    if (w * EXTREME_TOLERANCE_PARTS <= limit) extreme += w;
  }
  return Math.min(1, ratio(extreme, total));
}

/** Two-sided Fisher exact test of events against trials in 2 groups, for example late against sampled cycles. */
export function fisherExactTwoSided(events_1: number, trials_1: number, events_2: number, trials_2: number): number {
  const events = events_1 + events_2;
  const low = Math.max(0, events - trials_2);
  const high = Math.min(events, trials_1);
  const first = binomialRow(trials_1, high);
  const second = binomialRow(trials_2, events - low);
  const weights = new Map<number, bigint>();
  for (let x = low; x <= high; x++) weights.set(x, first[x] * second[events - x]);
  return twoSidedP(weights, events_1);
}

/**
 * Two-sided exact conditional binomial test of 2 event rates, for example service requests against wearer-months.
 * Given the total events, the first group's count is binomial with p = exposure_1 / (exposure_1 + exposure_2).
 */
export function conditionalBinomialTwoSided(events_1: number, exposure_1: number, events_2: number, exposure_2: number): number {
  const events = events_1 + events_2;
  const choose = binomialRow(events, events);
  const powers = (base: number) => {
    const out = [1n];
    for (let k = 0; k < events; k++) out.push(out[k] * BigInt(base));
    return out;
  };
  const first = powers(exposure_1);
  const second = powers(exposure_2);
  const weights = new Map<number, bigint>();
  for (let k = 0; k <= events; k++) weights.set(k, choose[k] * first[k] * second[events - k]);
  return twoSidedP(weights, events_1);
}

/** The label and test p-value for 2 sides that both pass the guard. */
function judge(
  comparisonEntry: ImprovementCatalogueEntry,
  defaults: ImprovementDefaults,
  period: ComparisonSide,
  comparison: ComparisonSide,
): { label: ComparisonLabel; p_value: number | null } {
  const change = period.value! - comparison.value!;
  let clear: boolean;
  let p_value: number | null = null;
  if (comparisonEntry.judged_by === "points_threshold") {
    clear = roundLikePython(Math.abs(100 * change)) >= defaults.scan_coverage_threshold_points;
  } else {
    const [a, b] = [comparison.counts, period.counts];
    p_value =
      comparisonEntry.kpi_id === "on_time_service_cycle_share"
        ? fisherExactTwoSided(a.late_cycles, a.sampled_cycles, b.late_cycles, b.sampled_cycles)
        : conditionalBinomialTwoSided(a.service_requests, a.wearer_months, b.service_requests, b.wearer_months);
    clear = p_value < 1 - defaults.test_level;
  }
  if (!clear || change === 0) return { label: "no_clear_change", p_value };
  const better = change > 0 === (comparisonEntry.better_when === "higher");
  return { label: better ? "better" : "worse", p_value };
}

/** One Customer's or Site's result for one comparison. */
function compareCustomerOrSite(
  comparisonEntry: ImprovementCatalogueEntry,
  scope: ResolvedScope,
  periods: ComparisonPeriods,
): ComparisonResult {
  const { defaults } = getPeriodComparisons().data;
  const { volume_text, caveats } = RESULT_TEXT[comparisonEntry.kpi_id];
  const atSite = scope.site_id !== null;
  const periodSide = calculateSide(comparisonEntry.kpi_id, scope, periods.period);
  const comparisonSide = calculateSide(comparisonEntry.kpi_id, scope, periods.comparison_period);
  const minimum = defaults[comparisonEntry.minimum_volume_parameter];
  const underMinimum = [comparisonSide, periodSide]
    .filter((side) => side.value === null || side.volume < minimum)
    .map((side) => `${side.volume.toLocaleString("en-US")} ${volume_text} in ${side.name}, under the minimum of ${minimum.toLocaleString("en-US")}.`);
  const { label, p_value } = underMinimum.length
    ? { label: "not_evaluated" as const, p_value: null }
    : judge(comparisonEntry, defaults, periodSide, comparisonSide);
  const change = periodSide.value === null || comparisonSide.value === null ? null : periodSide.value - comparisonSide.value;
  const relative = change === null || !comparisonSide.value ? null : change / comparisonSide.value;
  const rounded = (v: number | null) => (v === null ? null : roundLikePython(v));
  return {
    comparison_id: comparisonEntry.id as ComparisonId,
    scope: atSite ? "site" : "customer",
    scope_id: scope.site_id ?? scope.customer_id,
    customer_id: scope.customer_id,
    view: atSite ? "KAM" : "Both",
    period: { ...periodSide, value: rounded(periodSide.value) },
    comparison_period: { ...comparisonSide, value: rounded(comparisonSide.value) },
    change: rounded(change),
    relative_change: rounded(relative),
    label,
    not_evaluated_reason: underMinimum.length ? underMinimum.join(" ") : null,
    p_value: rounded(p_value),
    caveats: caveats.filter((c) => atSite || c !== SITE_CHANCE_CAVEAT),
  };
}

/**
 * A period comparison of the query's Customer or Site. The value is the change (period value minus comparison
 * period value) in the KPI's unit, and the full result with its label is in `detail`. A comparison that is not
 * evaluated has value null and the reason. Site results are KAM view only, and runKpi withholds them in the
 * Customer view.
 */
function comparison(comparison_id: ComparisonId, query: KpiQuery, unit: string): KpiResult {
  checkBreakdown(comparison_id, query, []);
  const scope = resolveScope(query.scope);
  const comparisonEntry = entry(comparison_id);
  // The catalogue entry's caveats include the Site chance caveat, which a Customer result does not carry.
  const forScope = (result: KpiResult): KpiResult =>
    scope.site_id !== null ? result : { ...result, caveats: result.caveats.filter((c) => c !== SITE_CHANCE_CAVEAT) };
  const periods = comparisonPeriods(query);
  if ("reason" in periods) return forScope(notEvaluated(comparisonEntry, query, unit, periods.reason));
  if (scope.product_ids !== null) {
    return forScope(notEvaluated(comparisonEntry, query, unit, "Period comparisons exist for a Customer or Site, not a product."));
  }
  const result = compareCustomerOrSite(comparisonEntry, scope, periods);
  const evaluated = result.label !== "not_evaluated";
  return forScope(
    kpiResult(comparisonEntry, query, {
      value: evaluated ? result.change : null,
      unit,
      volume: result.period.volume,
      not_evaluated_reason: evaluated ? null : result.not_evaluated_reason,
      caveats: result.caveats,
      detail: { kind: "period_comparison", comparison: result },
    }),
  );
}

/** On-time service cycle share against the comparison period. */
export function improvementOnTimeServiceCycles(query: KpiQuery): KpiResult {
  return comparison("improvement_on_time_service_cycles", query, "share");
}

/** Service requests per 100 wearers per month against the comparison period. */
export function improvementServiceRequests(query: KpiQuery): KpiResult {
  return comparison("improvement_service_requests", query, "per 100 wearers per month");
}

/** Scan coverage against the comparison period. */
export function improvementScanCoverage(query: KpiQuery): KpiResult {
  return comparison("improvement_scan_coverage", query, "share");
}
