// Footprint and handprint KPIs (#5).

import type { BaselineId } from "./master-data.ts";
import type { Month, ProcessedFile } from "./processed.ts";
import { readProcessed } from "./processed.ts";

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
