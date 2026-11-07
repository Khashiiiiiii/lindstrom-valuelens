// The query and result shapes of the calculation layer (#12), shared by every KPI module. The dashboard's
// server code and the LLM tools both call the calculations through these shapes (ADR 0001).

import type { AccountHealthRating, HealthInputResult } from "./account-health.ts";
import type { FactorCase } from "./footprint-handprint-kpis.ts";
import type { BaselineId } from "./master-data.ts";
import { getMasterData } from "./master-data.ts";
import type { CompareTo, ComparisonResult, ImprovementCatalogueEntry, PeriodComparisons } from "./period-comparisons.ts";
import type { CatalogueEntry, DataStatus, Month, ReviewPart, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

/** "2025", "2025-H1", "2025-H2" or a single month "2025-01". */
export type Period = "2025" | "2025-H1" | "2025-H2" | Month;

export interface Scope {
  customer_id: string;
  /** Must belong to customer_id, else the call throws. */
  site_id?: string;
  /** At most one of product_id and preset_id. */
  product_id?: string;
  preset_id?: string;
}

export interface KpiQuery {
  scope: Scope;
  period: Period;
  /** Set by the server from the dashboard's view toggle. The LLM never sets it. */
  view: "KAM" | "Customer";
  /** Handprint KPIs, default B_LOCAL. */
  baseline_id?: BaselineId;
  /** Handprint KPIs, default "default". */
  factor_case?: FactorCase;
  /** Footprint KPIs, default "total". */
  unit?: "total" | "per_active_wearer";
  /** repair_type, emission_source or treatment_route, following the KPI. */
  breakdown?: string;
  /** Replacements postponed per repair (A002). Default from operational-circularity-kpis.json. */
  postponement_ratio?: number;
  /** Period comparisons only. Default from compare_to.default_rule in period-comparisons.json. */
  compare_to?: CompareTo;
}

/** Values a KPI result carries beyond `value`, following the kind of KPI. */
export type KpiDetail =
  | {
      kind: "handprint";
      /** The baseline's name as a value states it, for example "vs outsourced local laundry". */
      baseline_label: string;
      factor_case: FactorCase;
      customer_washed_kg: number;
      /** Baseline factor times washed kg. `volume` holds the same number. */
      baseline_amount: number;
      /** The saving divided by baseline_amount. null when baseline_amount is 0. */
      share_of_baseline: number | null;
    }
  | { kind: "account_health"; rating: AccountHealthRating }
  | { kind: "account_health_input"; input: HealthInputResult }
  | { kind: "period_comparison"; comparison: ComparisonResult };

export interface KpiResult {
  kpi_id: string;
  name: string;
  evidence_area: string;
  review_part: ReviewPart;
  view: View;
  scope: Scope;
  period: Period;
  /**
   * null when the KPI is not evaluated, with not_evaluated_reason set. One exception: account_health is a rating,
   * not a number, so its value is always null and the rating is in `detail`.
   */
  value: number | null;
  /** For example "share", "count", "kg", "l", "kWh", "kg CO2e", "hours", "per 100 wearers per month". */
  unit: string;
  /** The denominator or sample size, for example sampled cycles. */
  volume: number | null;
  breakdown: { key: string; value: number }[] | null;
  baseline_id: BaselineId | null;
  not_evaluated_reason: string | null;
  data_status: DataStatus;
  assumptions: string[];
  caveats: string[];
  detail: KpiDetail | null;
}

export interface Withheld {
  kpi_id: string;
  withheld: true;
  reason: "KAM view only";
}

export type KpiAnswer = KpiResult | Withheld;

/** The query parameters beyond scope, period and view that a KPI accepts. */
export type KpiParameter = "baseline_id" | "factor_case" | "unit" | "breakdown" | "postponement_ratio" | "compare_to";

/** A KPI's calculation. */
export type KpiFunction = (query: KpiQuery) => KpiResult;

const FLOAT_DIGITS = 6;

/** value rounded to 6 places, the precision of data/processed/, so float addition noise never shows. */
export function round(value: number): number {
  return Number(value.toFixed(FLOAT_DIGITS));
}

/** The months a period covers. H1 and H2 come from period-comparisons.json. Throws on a period outside the data. */
export function periodMonths(period: Period): Month[] {
  const months = getMasterData().data.months;
  const year = months[0].slice(0, 4);
  // Read through readProcessed, not getPeriodComparisons, so this module has no runtime import of a module that
  // imports it.
  const { h1_months, h2_months } = readProcessed<PeriodComparisons, ImprovementCatalogueEntry>(
    "period-comparisons",
  ).data.compare_to;
  if (period === year) return [...months];
  if (period === `${year}-H1`) return [...h1_months];
  if (period === `${year}-H2`) return [...h2_months];
  if (months.includes(period)) return [period];
  throw new Error(`Unknown period "${period}". Use ${year}, ${year}-H1, ${year}-H2 or a month from ${months[0]} to ${months.at(-1)}.`);
}

/** Throw when the period is outside the data. */
export function checkPeriod(period: Period): void {
  periodMonths(period);
}

/** The period as precomputed rows name it ("2025" or a month), or null for a half-year, which has no rows. */
export function precomputedPeriod(period: Period): string | null {
  checkPeriod(period);
  return period.includes("-H") ? null : period;
}

/** The catalogue entry with this id. Throws if the file has none. */
export function catalogueEntry<TEntry extends CatalogueEntry>(catalogue: TEntry[], file: string, id: string): TEntry {
  const found = catalogue.find((e) => e.id === id);
  if (!found) throw new Error(`${file}.json has no catalogue entry "${id}".`);
  return found;
}

/** A scope checked against master data, with the Sites and products it covers. */
export interface ResolvedScope {
  customer_id: string;
  site_id: string | null;
  site_ids: Set<string>;
  /** null for all products. */
  product_ids: Set<string> | null;
  product_scope: "all" | "product" | "preset";
  product_scope_id: string | null;
}

/** Check a scope against master data. Throws on an unknown id or a Site of another Customer. */
export function resolveScope(scope: Scope): ResolvedScope {
  const master = getMasterData().data;
  const { customer_id, site_id, product_id, preset_id } = scope;
  if (!master.customers.some((c) => c.customer_id === customer_id)) {
    throw new Error(`Unknown customer_id "${customer_id}".`);
  }
  const sites = master.sites.filter((s) => s.customer_id === customer_id);
  if (site_id !== undefined) {
    const site = master.sites.find((s) => s.site_id === site_id);
    if (!site) throw new Error(`Unknown site_id "${site_id}".`);
    if (site.customer_id !== customer_id) {
      throw new Error(`Site ${site_id} belongs to ${site.customer_id}, not ${customer_id}.`);
    }
  }
  if (product_id !== undefined && preset_id !== undefined) {
    throw new Error("Give at most one of product_id and preset_id.");
  }
  let product_ids: Set<string> | null = null;
  if (product_id !== undefined) {
    if (!master.products.some((p) => p.product_id === product_id)) {
      throw new Error(`Unknown product_id "${product_id}".`);
    }
    product_ids = new Set([product_id]);
  }
  if (preset_id !== undefined) {
    const preset = master.product_presets.find((p) => p.preset_id === preset_id);
    if (!preset) throw new Error(`Unknown preset_id "${preset_id}".`);
    product_ids = new Set(preset.product_ids);
  }
  return {
    customer_id,
    site_id: site_id ?? null,
    site_ids: new Set(site_id === undefined ? sites.map((s) => s.site_id) : [site_id]),
    product_ids,
    product_scope: product_id !== undefined ? "product" : preset_id !== undefined ? "preset" : "all",
    product_scope_id: product_id ?? preset_id ?? null,
  };
}

/** How precomputed rows name the scope: a Site when site_id is set, else the Customer. */
export function scopeRow(scope: ResolvedScope): { scope: "customer" | "site"; scope_id: string } {
  return scope.site_id === null
    ? { scope: "customer", scope_id: scope.customer_id }
    : { scope: "site", scope_id: scope.site_id };
}

/** Whether a fact row falls in the scope and in the months. Rows with no product_id match any product scope. */
export function inScope(
  row: { customer_id: string; site_id: string; month: Month; product_id?: string },
  scope: ResolvedScope,
  months: Month[],
): boolean {
  return (
    row.customer_id === scope.customer_id &&
    scope.site_ids.has(row.site_id) &&
    months.includes(row.month) &&
    (scope.product_ids === null || row.product_id === undefined || scope.product_ids.has(row.product_id))
  );
}

/** The fields of a result that the calculation sets. The rest come from the catalogue entry and the query. */
export interface ResultFields {
  value: number | null;
  unit: string;
  volume?: number | null;
  breakdown?: { key: string; value: number }[] | null;
  baseline_id?: BaselineId | null;
  not_evaluated_reason?: string | null;
  /** Added after the catalogue entry's caveats. */
  caveats?: string[];
  detail?: KpiDetail | null;
}

/** A KPI result: the catalogue entry's labels with the calculated fields. Values are rounded to 6 places. */
export function kpiResult(entry: CatalogueEntry, query: KpiQuery, fields: ResultFields): KpiResult {
  const rounded = (v: number | null | undefined) => (v === null || v === undefined ? null : round(v));
  return {
    kpi_id: entry.id,
    name: entry.name,
    evidence_area: entry.evidence_area,
    review_part: entry.review_part,
    view: entry.view,
    scope: query.scope,
    period: query.period,
    value: rounded(fields.value),
    unit: fields.unit,
    volume: rounded(fields.volume),
    breakdown: fields.breakdown?.map((b) => ({ key: b.key, value: round(b.value) })) ?? null,
    baseline_id: fields.baseline_id ?? null,
    not_evaluated_reason: fields.not_evaluated_reason ?? null,
    data_status: entry.data_status,
    assumptions: [...entry.assumptions],
    caveats: [...new Set([...entry.caveats, ...(fields.caveats ?? [])])],
    detail: fields.detail ?? null,
  };
}

/** A result with no value, and the reason why. */
export function notEvaluated(entry: CatalogueEntry, query: KpiQuery, unit: string, reason: string): KpiResult {
  return kpiResult(entry, query, { value: null, unit, not_evaluated_reason: reason });
}

/** Throw when the query asks for a breakdown the KPI does not have. Returns the breakdown, or null for none. */
export function checkBreakdown(kpi_id: string, query: KpiQuery, allowed: string[]): string | null {
  const breakdown = query.breakdown;
  if (breakdown === undefined) return null;
  if (!allowed.includes(breakdown)) {
    const options = allowed.length ? `Use ${allowed.join(" or ")}.` : "It takes no breakdown.";
    throw new Error(`${kpi_id} has no breakdown "${breakdown}". ${options}`);
  }
  return breakdown;
}

/** Sum a field over rows. */
export function sum<T>(rows: T[], field: (row: T) => number): number {
  let total = 0;
  for (const row of rows) total += field(row);
  return total;
}

/** Sum a field per key, in first-seen key order. */
export function sumBy<T>(rows: T[], key: (row: T) => string, field: (row: T) => number): { key: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + field(row));
  return [...totals].map(([k, v]) => ({ key: k, value: v }));
}

/**
 * The view rule (ADR 0011): in the Customer view, a KAM-only entry and a period comparison at Site grain are
 * withheld. Returns Withheld for those, else null. runKpi checks it before it calculates anything.
 */
export function withheldInView(entry: CatalogueEntry, view: KpiQuery["view"], scope: Scope): Withheld | null {
  if (view === "KAM") return null;
  const siteGrainKamOnly = "site_view" in entry && entry.site_view === "KAM" && scope.site_id !== undefined;
  if (entry.view === "KAM" || siteGrainKamOnly) return { kpi_id: entry.id, withheld: true, reason: "KAM view only" };
  return null;
}

/** Apply the view rule to a result: Withheld when withheldInView says so, else the result. */
export function applyView(entry: CatalogueEntry, view: KpiQuery["view"], result: KpiResult): KpiAnswer {
  return withheldInView(entry, view, result.scope) ?? result;
}
