// Footprint and handprint KPIs (#5).

import type { BaselineId } from "./master-data.ts";
import type { CatalogueEntry, Month, ProcessedFile } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiQuery, KpiResult, ResolvedScope } from "./query.ts";
import {
  catalogueEntry,
  checkBreakdown,
  inScope,
  kpiResult,
  notEvaluated,
  periodMonths,
  resolveScope,
  round,
  sum,
} from "./query.ts";
import { averageActiveWearers } from "./service-kpis.ts";

/** One Customer_Impacts row: the Customer's allocated footprint at one Site, for one product and laundry, in one month. */
export interface FootprintFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  laundry_id: string;
  customer_washed_kg: number;
  allocated_water_l: number;
  allocated_energy_kwh: number;
  allocated_process_kgco2e: number;
  allocated_delivery_kgco2e: number;
  /** The workbook's own B_LOCAL handprint, kept for tie-out. Read the handprint rows instead. */
  water_saving_vs_local_l: number;
  energy_saving_vs_local_kwh: number;
  emissions_saving_vs_local_kgco2e: number;
}

/** A baseline's factors. Each factor is an override parameter, and these workbook values are its default. */
export interface BaselineFactors {
  baseline_id: BaselineId;
  baseline_name: string;
  /** How a value names its baseline, for example "vs outsourced local laundry". */
  label: string;
  selection_status: "DEFAULT" | "OPTION";
  assumption_note: string;
  water_l_per_kg: number;
  energy_kwh_per_kg: number;
  process_kgco2e_per_kg: number;
  delivery_kgco2e_per_kg: number;
}

export type BaselineFactor = "water_l_per_kg" | "energy_kwh_per_kg" | "process_kgco2e_per_kg" | "delivery_kgco2e_per_kg";

/** A TEAM_ASSUMPTION value that replaces one baseline factor, for the KAM to judge the spread. */
export interface BaselineLowCase {
  id: string;
  baseline_id: BaselineId;
  factor: BaselineFactor;
  value: number;
  data_status: "TEAM_ASSUMPTION";
  rationale: string;
  /** Ids in public-reference.json. */
  figure_ids: string[];
}

export interface FootprintBaselines {
  default_baseline_id: BaselineId;
  factors: BaselineFactors[];
  low_cases: BaselineLowCase[];
}

/** "default" uses the workbook factors. "low_case" swaps in the baseline's low case. */
export type FactorCase = "default" | "low_case";

/**
 * Precomputed handprint for one scope, period, baseline and factor case. Amounts and baseline footprints add up;
 * a share is saved divided by baseline, so rebuild it from summed totals for any other grain.
 */
export interface HandprintRow {
  scope: "customer" | "site";
  /** A customer_id or a site_id, following scope. */
  scope_id: string;
  customer_id: string;
  /** A "YYYY-MM" month or a "YYYY" year. */
  period: string;
  baseline_id: BaselineId;
  factor_case: FactorCase;
  customer_washed_kg: number;
  baseline_water_l: number;
  water_saved_l: number;
  water_saved_share: number | null;
  baseline_energy_kwh: number;
  energy_saved_kwh: number;
  energy_saved_share: number | null;
  /** Process plus delivery. */
  baseline_emissions_kgco2e: number;
  emissions_saved_kgco2e: number;
  emissions_saved_share: number | null;
}

/** Monthly average active wearers for one scope and period, by the wearer counting rule. */
export interface PerWearerDenominator {
  scope: "customer" | "site";
  scope_id: string;
  customer_id: string;
  /** A "YYYY-MM" month or a "YYYY" year. */
  period: string;
  active_wearers: number;
}

/** A parameter that some footprint or handprint KPIs take. */
export interface FootprintHandprintParameter {
  id: "unit" | "emission_source" | "baseline";
  values: string[];
  /** null for a breakdown that is off by default. */
  default: string | null;
  kpi_ids: string[];
  note: string;
}

/** One laundry in one month, copied from Laundry_Resources. */
export interface LaundryMonthFactors {
  laundry_id: string;
  month: Month;
  washed_kg: number;
  fresh_water_l: number;
  process_energy_kwh: number;
  process_emissions_kgco2e: number;
  /** The workbook's factors, rounded in the source. Rebuild a period factor from the totals. */
  fresh_water_l_per_kg: number;
  energy_kwh_per_kg: number;
}

/** A laundry's fixed process CO2e per kWh, set by the country grid. */
export interface LaundryProcessCo2ePerKwh {
  laundry_id: string;
  process_kgco2e_per_kwh: number;
}

/** Data transparency for the KAM view. Laundry factors are not Customer KPIs (ADR 0012). */
export interface FootprintTransparency {
  view: "KAM";
  laundry_month_factors: LaundryMonthFactors[];
  laundry_process_co2e_per_kwh: LaundryProcessCo2ePerKwh[];
  /** Ids in public-reference.json to set next to the baseline factors and the dataset's actuals. */
  public_figure_ids: string[];
}

/** Footprint and handprint. Avoided product CO2e lives in operational-circularity-kpis.json and is never added (ADR 0007). */
export interface FootprintHandprintKpis {
  /** The Customer_Impacts rows. */
  footprint: FootprintFact[];
  baselines: FootprintBaselines;
  handprint: HandprintRow[];
  per_wearer_denominators: PerWearerDenominator[];
  parameters: FootprintHandprintParameter[];
  transparency: FootprintTransparency;
}

export function getFootprintHandprintKpis(): ProcessedFile<FootprintHandprintKpis> {
  return readProcessed<FootprintHandprintKpis>("footprint-handprint-kpis");
}

// Calculations (#12). Footprint KPIs sum the Customer_Impacts facts over the period's months.

function entry(id: string): CatalogueEntry {
  return catalogueEntry(getFootprintHandprintKpis().catalogue, "footprint-handprint-kpis", id);
}

function footprintFacts(scope: ResolvedScope, months: Month[]): FootprintFact[] {
  return getFootprintHandprintKpis().data.footprint.filter((f) => inScope(f, scope, months));
}

/**
 * A footprint KPI: the period total of each part, or the total per active wearer. With a breakdown, each part is
 * one breakdown row and the value is their sum.
 */
function footprint(
  kpi_id: string,
  query: KpiQuery,
  unit: string,
  parts: { key: string; field: (f: FootprintFact) => number }[],
  breakdowns: string[] = [],
): KpiResult {
  const breakdown = checkBreakdown(kpi_id, query, breakdowns);
  const perWearer = query.unit === "per_active_wearer";
  if (query.unit !== undefined && query.unit !== "total" && !perWearer) {
    throw new Error(`Unknown unit "${query.unit}". Use total or per_active_wearer.`);
  }
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  const facts = footprintFacts(scope, months);
  const totals = parts.map((p) => ({ key: p.key, value: sum(facts, p.field) }));
  const total = sum(totals, (t) => t.value);
  if (!perWearer) {
    return kpiResult(entry(kpi_id), query, { value: total, unit, breakdown: breakdown ? totals : null });
  }
  const wearers = averageActiveWearers(scope, months);
  const perWearerUnit = `${unit} per active wearer`;
  if (wearers === 0) return notEvaluated(entry(kpi_id), query, perWearerUnit, "No active wearers in the period.");
  return kpiResult(entry(kpi_id), query, {
    value: total / wearers,
    unit: perWearerUnit,
    volume: wearers,
    breakdown: breakdown ? totals.map((t) => ({ key: t.key, value: t.value / wearers })) : null,
    caveats: ["Per active wearer uses the wearer counting rule: per Site and month, the largest product row."],
  });
}

/** Sum of customer_washed_kg over the period, in total or per active wearer. */
export function washedKg(query: KpiQuery): KpiResult {
  return footprint("washed_kg", query, "kg", [{ key: "washed", field: (f) => f.customer_washed_kg }]);
}

/** Sum of allocated_water_l over the period, in total or per active wearer. */
export function waterUseAllocated(query: KpiQuery): KpiResult {
  return footprint("water_use_allocated", query, "l", [{ key: "water", field: (f) => f.allocated_water_l }]);
}

/** Sum of allocated_energy_kwh over the period, in total or per active wearer. */
export function energyUseAllocated(query: KpiQuery): KpiResult {
  return footprint("energy_use_allocated", query, "kWh", [{ key: "energy", field: (f) => f.allocated_energy_kwh }]);
}

/** Sum of process and delivery kg CO2e over the period. Emission source is a breakdown. */
export function emissionsAllocated(query: KpiQuery): KpiResult {
  return footprint(
    "emissions_allocated",
    query,
    "kg CO2e",
    [
      { key: "process", field: (f) => f.allocated_process_kgco2e },
      { key: "delivery", field: (f) => f.allocated_delivery_kgco2e },
    ],
    ["emission_source"],
  );
}

/**
 * A handprint KPI: the baseline factor times washed kg, minus the allocated footprint, from the period's summed
 * facts. It matches the precomputed handprint rows and works for any period and product.
 */
function handprint(
  kpi_id: string,
  query: KpiQuery,
  unit: string,
  factor: (f: BaselineFactors) => number,
  actual: (f: FootprintFact) => number,
): KpiResult {
  checkBreakdown(kpi_id, query, []);
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  const { baselines } = getFootprintHandprintKpis().data;
  const baseline_id = query.baseline_id ?? baselines.default_baseline_id;
  const factors = baselines.factors.find((b) => b.baseline_id === baseline_id);
  if (!factors) throw new Error(`Unknown baseline_id "${baseline_id}".`);
  const factor_case = query.factor_case ?? "default";
  if (factor_case !== "default" && factor_case !== "low_case") throw new Error(`Unknown factor_case "${factor_case}".`);
  let used = factors;
  const caveats: string[] = [];
  if (factor_case === "low_case") {
    const low = baselines.low_cases.find((l) => l.baseline_id === baseline_id);
    if (!low) {
      return kpiResult(entry(kpi_id), query, {
        value: null,
        unit,
        baseline_id,
        not_evaluated_reason: `No low case exists for ${baseline_id}. Only ${baselines.low_cases.map((l) => l.baseline_id).join(", ")} has one.`,
      });
    }
    used = { ...factors, [low.factor]: low.value };
    caveats.push(`Uses the TEAM_ASSUMPTION low case of ${low.value} for ${low.factor}: ${low.rationale}`);
  }
  const facts = footprintFacts(scope, months);
  const customer_washed_kg = sum(facts, (f) => f.customer_washed_kg);
  const baseline_amount = factor(used) * customer_washed_kg;
  const saved = baseline_amount - sum(facts, actual);
  return kpiResult(entry(kpi_id), query, {
    value: saved,
    unit,
    volume: baseline_amount,
    baseline_id,
    caveats,
    detail: {
      kind: "handprint",
      baseline_label: factors.label,
      factor_case,
      customer_washed_kg: round(customer_washed_kg),
      baseline_amount: round(baseline_amount),
      share_of_baseline: baseline_amount ? round(saved / baseline_amount) : null,
    },
  });
}

/** Water saved against a baseline, in litres. */
export function waterSaved(query: KpiQuery): KpiResult {
  return handprint("water_saved", query, "l", (b) => b.water_l_per_kg, (f) => f.allocated_water_l);
}

/** Energy saved against a baseline, in kWh. */
export function energySaved(query: KpiQuery): KpiResult {
  return handprint("energy_saved", query, "kWh", (b) => b.energy_kwh_per_kg, (f) => f.allocated_energy_kwh);
}

/** Emissions saved against a baseline, process plus delivery, in kg CO2e. Never added to avoided product CO2e (ADR 0007). */
export function emissionsSaved(query: KpiQuery): KpiResult {
  return handprint(
    "emissions_saved",
    query,
    "kg CO2e",
    (b) => b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg,
    (f) => f.allocated_process_kgco2e + f.allocated_delivery_kgco2e,
  );
}
