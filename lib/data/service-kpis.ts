// Service performance and adoption KPIs (#3).

import type { CatalogueEntry, DataTransparencyNote, Month, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiQuery, KpiResult, ResolvedScope, ResultFields } from "./query.ts";
import {
  catalogueEntry,
  checkBreakdown,
  inScope,
  kpiResult,
  notEvaluated,
  periodMonths,
  precomputedPeriod,
  resolveScope,
  scopeRow,
  sum,
} from "./query.ts";

/** One Service_Activity row: a month, Site and product. */
export interface ServiceActivityFact {
  customer_id: string;
  site_id: string;
  product_id: string;
  month: Month;
  /** The row value. Sum across products only via the wearer counting rule (site_month). */
  active_wearers: number;
  allocated_pieces: number;
  active_assets_scanned: number;
  washed_pieces: number;
  packed_pieces: number;
  service_requests: number;
}

/** One Site and month. active_wearers is the largest product row; the other fields are sums over products. */
export interface ServiceSiteMonthFact {
  customer_id: string;
  site_id: string;
  month: Month;
  active_wearers: number;
  allocated_pieces: number;
  active_assets_scanned: number;
  washed_pieces: number;
  packed_pieces: number;
  service_requests: number;
}

/** Sampled service cycles per month of delivered_timestamp, Site and product. May include months after the data months. */
export interface ServiceCycleFact {
  customer_id: string;
  site_id: string;
  product_id: string;
  month: Month;
  cycles: number;
  /** Cycles over 120 hours. */
  late_cycles: number;
}

/**
 * Precomputed turnaround statistics for one scope, product set and period. Only cycles delivered in the data months
 * count. A combination with no sampled cycles has no row.
 */
export interface ServiceTurnaround {
  scope: "customer" | "site";
  /** A customer_id or a site_id, following scope. */
  scope_id: string;
  customer_id: string;
  product_scope: "all" | "product" | "preset";
  /** null for "all", a product_id for "product", a preset_id for "preset". */
  product_scope_id: string | null;
  /** A "YYYY-MM" month or a "YYYY" year. */
  period: string;
  cycles: number;
  median_cycle_hours: number;
  p90_cycle_hours: number;
  median_pickup_to_in_laundry_hours: number;
  median_in_laundry_to_out_laundry_hours: number;
  median_out_laundry_to_delivered_hours: number;
}

export interface ServiceKpis {
  activity: ServiceActivityFact[];
  site_month: ServiceSiteMonthFact[];
  cycles: ServiceCycleFact[];
  turnaround: ServiceTurnaround[];
  data_transparency_notes: DataTransparencyNote[];
}

export function getServiceKpis(): ProcessedFile<ServiceKpis> {
  return readProcessed<ServiceKpis>("service-kpis");
}

// Calculations (#12).

/**
 * Monthly active wearers by the wearer counting rule (ADR 0003). Per Site and month, the count is the largest
 * product row in the scope's products. A Customer is the sum of its Sites. At product grain the count is the row
 * value. The result has one count per month of the period, and a month with no rows counts as 0.
 */
export function monthlyActiveWearers(scope: ResolvedScope, months: Month[]): number[] {
  const largest = new Map<string, number>();
  for (const row of getServiceKpis().data.activity) {
    if (!inScope(row, scope, months)) continue;
    const key = `${row.site_id}|${row.month}`;
    largest.set(key, Math.max(largest.get(key) ?? 0, row.active_wearers));
  }
  return months.map((m) => sum([...scope.site_ids], (site) => largest.get(`${site}|${m}`) ?? 0));
}

/** The monthly average of active wearers over the months, by the wearer counting rule. */
export function averageActiveWearers(scope: ResolvedScope, months: Month[]): number {
  return sum(monthlyActiveWearers(scope, months), (w) => w) / months.length;
}

function entry(id: string): CatalogueEntry {
  return catalogueEntry(getServiceKpis().catalogue, "service-kpis", id);
}

interface ActivityTotals {
  months: Month[];
  rows: ServiceActivityFact[];
  allocated_pieces: number;
  active_assets_scanned: number;
  washed_pieces: number;
  service_requests: number;
  /** Active wearers summed over the months, by the wearer counting rule. */
  wearer_months: number;
}

/** The Service_Activity rows of the query's scope and period, with their totals. Breakdowns are not offered. */
function activityTotals(kpi_id: string, query: KpiQuery): ActivityTotals {
  checkBreakdown(kpi_id, query, []);
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  const rows = getServiceKpis().data.activity.filter((f) => inScope(f, scope, months));
  return {
    months,
    rows,
    allocated_pieces: sum(rows, (f) => f.allocated_pieces),
    active_assets_scanned: sum(rows, (f) => f.active_assets_scanned),
    washed_pieces: sum(rows, (f) => f.washed_pieces),
    service_requests: sum(rows, (f) => f.service_requests),
    wearer_months: sum(monthlyActiveWearers(scope, months), (w) => w),
  };
}

/** Sampled cycles and late cycles of the query's scope and period. Only cycles delivered in the data months count. */
function cycleTotals(kpi_id: string, query: KpiQuery): { cycles: number; late_cycles: number } {
  checkBreakdown(kpi_id, query, []);
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  const rows = getServiceKpis().data.cycles.filter((f) => inScope(f, scope, months));
  return { cycles: sum(rows, (f) => f.cycles), late_cycles: sum(rows, (f) => f.late_cycles) };
}

const NO_CYCLES = "No sampled service cycles in the period.";
const NO_WEARERS = "No active wearers in the period.";
const NO_ALLOCATED = "No allocated pieces in the period.";

/** On-time cycles divided by sampled cycles. A cycle is on time at 120 hours or less. */
export function onTimeServiceCycleShare(query: KpiQuery): KpiResult {
  const { cycles, late_cycles } = cycleTotals("on_time_service_cycle_share", query);
  if (cycles === 0) return notEvaluated(entry("on_time_service_cycle_share"), query, "share", NO_CYCLES);
  return kpiResult(entry("on_time_service_cycle_share"), query, {
    value: (cycles - late_cycles) / cycles,
    unit: "share",
    volume: cycles,
  });
}

/** Count of cycles over 120 hours, with the sampled cycles as volume. */
export function lateServiceCycles(query: KpiQuery): KpiResult {
  const { cycles, late_cycles } = cycleTotals("late_service_cycles", query);
  return kpiResult(entry("late_service_cycles"), query, { value: late_cycles, unit: "count", volume: cycles });
}

/**
 * The precomputed turnaround row of the query's scope, product set and period. Medians do not add up, so a
 * half-year has no row and returns a reason instead.
 */
function turnaround(kpi_id: string, query: KpiQuery, unit: string, read: (row: ServiceTurnaround) => Omit<ResultFields, "unit">): KpiResult {
  checkBreakdown(kpi_id, query, []);
  const scope = resolveScope(query.scope);
  const period = precomputedPeriod(query.period);
  if (period === null) {
    return notEvaluated(entry(kpi_id), query, unit, "Medians are precomputed for all of 2025 and single months only.");
  }
  const named = scopeRow(scope);
  const row = getServiceKpis().data.turnaround.find(
    (r) =>
      r.scope === named.scope &&
      r.scope_id === named.scope_id &&
      r.product_scope === scope.product_scope &&
      r.product_scope_id === scope.product_scope_id &&
      r.period === period,
  );
  if (!row) return notEvaluated(entry(kpi_id), query, unit, NO_CYCLES);
  return kpiResult(entry(kpi_id), query, { unit, volume: row.cycles, ...read(row) });
}

/** Median cycle hours of the cycles delivered in the period. */
export function turnaroundHoursMedian(query: KpiQuery): KpiResult {
  return turnaround("turnaround_hours_median", query, "hours", (r) => ({ value: r.median_cycle_hours }));
}

/** 90th percentile of cycle hours. */
export function turnaroundHours90thPercentile(query: KpiQuery): KpiResult {
  return turnaround("turnaround_hours_90th_percentile", query, "hours", (r) => ({ value: r.p90_cycle_hours }));
}

/** Median hours of each stage as a breakdown. The value is the median cycle hours. KAM view only. */
export function turnaroundByStage(query: KpiQuery): KpiResult {
  return turnaround("turnaround_by_stage", query, "hours", (r) => ({
    value: r.median_cycle_hours,
    breakdown: [
      { key: "pickup_to_in_laundry", value: r.median_pickup_to_in_laundry_hours },
      { key: "in_laundry_to_out_laundry", value: r.median_in_laundry_to_out_laundry_hours },
      { key: "out_laundry_to_delivered", value: r.median_out_laundry_to_delivered_hours },
    ],
    caveats: ["The value is the median cycle hours. The stage medians do not add up to it."],
  }));
}

/** Sum of service_requests over the period. */
export function serviceRequests(query: KpiQuery): KpiResult {
  const totals = activityTotals("service_requests", query);
  return kpiResult(entry("service_requests"), query, { value: totals.service_requests, unit: "count" });
}

/** Service requests per month per 100 monthly average active wearers: requests over wearer-months, times 100. */
export function serviceRequestsPer100Wearers(query: KpiQuery): KpiResult {
  const unit = "per 100 wearers per month";
  const totals = activityTotals("service_requests_per_100_wearers", query);
  if (totals.wearer_months === 0) return notEvaluated(entry("service_requests_per_100_wearers"), query, unit, NO_WEARERS);
  return kpiResult(entry("service_requests_per_100_wearers"), query, {
    value: (100 * totals.service_requests) / totals.wearer_months,
    unit,
    volume: totals.wearer_months,
  });
}

/** Share of the scope's Site-months with zero service requests. The volume is the number of Site-months. */
export function serviceRequestFreeSiteMonths(query: KpiQuery): KpiResult {
  const unit = "share";
  const { rows } = activityTotals("service_request_free_site_months", query);
  const requests = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.site_id}|${row.month}`;
    requests.set(key, (requests.get(key) ?? 0) + row.service_requests);
  }
  if (requests.size === 0) {
    return notEvaluated(entry("service_request_free_site_months"), query, unit, "No Site-months in the period.");
  }
  const free = [...requests.values()].filter((count) => count === 0).length;
  return kpiResult(entry("service_request_free_site_months"), query, {
    value: free / requests.size,
    unit,
    volume: requests.size,
  });
}

/** Monthly average active wearers, by the wearer counting rule. */
export function activeWearers(query: KpiQuery): KpiResult {
  const totals = activityTotals("active_wearers", query);
  return kpiResult(entry("active_wearers"), query, {
    value: totals.wearer_months / totals.months.length,
    unit: "wearers",
  });
}

/** Allocated pieces divided by active wearers, both as monthly averages. */
export function garmentsPerWearer(query: KpiQuery): KpiResult {
  const unit = "garments per wearer";
  const totals = activityTotals("garments_per_wearer", query);
  if (totals.wearer_months === 0) return notEvaluated(entry("garments_per_wearer"), query, unit, NO_WEARERS);
  return kpiResult(entry("garments_per_wearer"), query, {
    value: totals.allocated_pieces / totals.wearer_months,
    unit,
    volume: totals.wearer_months / totals.months.length,
  });
}

/** Active assets scanned divided by allocated pieces. The volume is allocated pieces, monthly average. */
export function scanCoverage(query: KpiQuery): KpiResult {
  const totals = activityTotals("scan_coverage", query);
  if (totals.allocated_pieces === 0) return notEvaluated(entry("scan_coverage"), query, "share", NO_ALLOCATED);
  return kpiResult(entry("scan_coverage"), query, {
    value: totals.active_assets_scanned / totals.allocated_pieces,
    unit: "share",
    volume: totals.allocated_pieces / totals.months.length,
  });
}

/** Allocated pieces minus active assets scanned, as a monthly average rounded to a whole number. */
export function allocatedGarmentsWithNoScanActivity(query: KpiQuery): KpiResult {
  const totals = activityTotals("allocated_garments_with_no_scan_activity", query);
  return kpiResult(entry("allocated_garments_with_no_scan_activity"), query, {
    value: Math.round((totals.allocated_pieces - totals.active_assets_scanned) / totals.months.length),
    unit: "garments",
  });
}

/** Washed pieces divided by allocated pieces, from summed totals: washes per garment per month. */
export function washesPerGarment(query: KpiQuery): KpiResult {
  const unit = "washes per garment per month";
  const totals = activityTotals("washes_per_garment", query);
  if (totals.allocated_pieces === 0) return notEvaluated(entry("washes_per_garment"), query, unit, NO_ALLOCATED);
  return kpiResult(entry("washes_per_garment"), query, {
    value: totals.washed_pieces / totals.allocated_pieces,
    unit,
    volume: totals.allocated_pieces / totals.months.length,
  });
}

/** Monthly average of allocated pieces across the scope's products, rounded to a whole number. */
export function garmentsInCirculation(query: KpiQuery): KpiResult {
  const totals = activityTotals("garments_in_circulation", query);
  return kpiResult(entry("garments_in_circulation"), query, {
    value: Math.round(totals.allocated_pieces / totals.months.length),
    unit: "garments",
  });
}
