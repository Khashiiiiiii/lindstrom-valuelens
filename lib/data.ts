// Typed readers for the JSON files in data/processed/, written by scripts/preprocess.py.
// Readers only load and type the data. Calculations live elsewhere.

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Shared shape of every processed file

/** A "YYYY-MM" month string, for example "2025-01". */
export type Month = string;

/** How a value was obtained. Values used by the workbook and the KPI catalogue. */
export type DataStatus =
  | "SYNTHETIC"
  | "SYNTHETIC_ESTIMATE"
  | "SYNTHETIC_STRUCTURALLY_REPRESENTATIVE"
  | "ALLOCATED_ESTIMATE_SYNTHETIC"
  | "PUBLIC_REFERENCE"
  | "TEAM_ASSUMPTION";

export type View = "KAM" | "Customer" | "Both";

export type ReviewPart = "Look back" | "Show value" | "Build trust" | "Look forward" | "Agree actions";

/** One KPI, opportunity signal, period comparison or rule in a file's catalogue. */
export interface CatalogueEntry {
  id: string;
  name: string;
  evidence_area: string;
  core_or_industry: "Core KPI";
  customer_question: string;
  definition: string;
  source_fields: string[];
  grain: string;
  view: View;
  review_part: ReviewPart;
  data_status: DataStatus;
  assumptions: string[];
  caveats: string[];
}

export interface ProcessedMeta {
  /** The file name without ".json", for example "master-data". */
  name: string;
  source_file: string;
  /** SHA-256 of the source workbook. */
  source_sha256: string;
}

export interface ProcessedFile<TData, TEntry extends CatalogueEntry = CatalogueEntry> {
  meta: ProcessedMeta;
  catalogue: TEntry[];
  data: TData;
}

const PROCESSED_DIR = join(process.cwd(), "data", "processed");
const cache = new Map<string, unknown>();

/** Read data/processed/<name>.json once per process and return the parsed file. */
export function readProcessed<TData, TEntry extends CatalogueEntry = CatalogueEntry>(
  name: string,
): ProcessedFile<TData, TEntry> {
  let file = cache.get(name);
  if (file === undefined) {
    file = JSON.parse(readFileSync(join(PROCESSED_DIR, `${name}.json`), "utf-8"));
    cache.set(name, file);
  }
  return file as ProcessedFile<TData, TEntry>;
}

// master-data.json

export interface Customer {
  customer_id: string;
  customer_name: string;
  industry: string;
  segment: string;
  hq_country: string;
  /** The Customer's stated topics, in sheet order. */
  priority_topics: string[];
  data_status: DataStatus;
}

export interface Site {
  site_id: string;
  customer_id: string;
  site_name: string;
  country: string;
  city: string;
  site_type: string;
  primary_laundry_id: string;
  data_status: DataStatus;
}

export interface Laundry {
  laundry_id: string;
  laundry_name: string;
  country: string;
  country_code: string;
  note: string;
}

export interface Product {
  product_id: string;
  product_name: string;
  product_group: string;
  avg_weight_kg: number;
  synthetic_product_footprint_kgco2e: number;
  /** Lindström's purchase cost, not a Customer cost (ADR 0005). */
  synthetic_purchase_cost_eur: number;
  material_note: string;
}

/** A washing alternative that a handprint compares against. */
export interface Baseline {
  baseline_id: string;
  baseline_name: string;
  selection_status: "DEFAULT" | "OPTION";
  water_l_per_kg: number;
  energy_kwh_per_kg: number;
  process_kgco2e_per_kg: number;
  delivery_kgco2e_per_kg: number;
  mixed_waste_share: number;
  assumption_note: string;
}

export interface Assumption {
  assumption_id: string;
  assumption: string;
  value_or_rule: string;
  rationale: string;
  category: string;
  confidence: string;
  treatment: string;
}

export interface IndustryPriority {
  industry: string;
  priority_rank: number;
  priority_theme: string;
  dashboard_emphasis: string;
}

export interface DataQualityEntry {
  dataset: string;
  fields: string;
  /** The workbook's own label, which uses more values than DataStatus. */
  status: string;
  confidence: string;
  note: string;
}

/** A named product set that every product parameter accepts. */
export interface ProductPreset {
  preset_id: "food_industry_garments" | "safety_garments" | "healthcare_garments";
  name: string;
  product_ids: string[];
}

/** The Sites of one Customer with one site_type. */
export interface SiteTypeGroup {
  customer_id: string;
  site_type: string;
  site_count: number;
  site_ids: string[];
}

export interface MasterData {
  customers: Customer[];
  sites: Site[];
  laundries: Laundry[];
  products: Product[];
  baselines: Baseline[];
  default_baseline_id: string;
  assumptions: Assumption[];
  industry_priorities: IndustryPriority[];
  data_quality: DataQualityEntry[];
  /** The months the data covers: the 12 months of 2025. */
  months: Month[];
  product_presets: ProductPreset[];
  site_type_groups: SiteTypeGroup[];
}

export function getMasterData(): ProcessedFile<MasterData> {
  return readProcessed<MasterData>("master-data");
}

// operational-circularity-kpis.json

/** The workbook's repair types. */
export type RepairType = "BUTTON" | "DARNING / PATCHING" | "OTHER ACCESSORIES" | "OTHER SEAM STITCHING" | "ZIPPER";

/** Repairs at one Site, for one product and repair type, in one month. */
export interface RepairFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  repair_type: RepairType;
  repair_count: number;
  /** kg CO2e of one new garment of this product, from Products (A005). Not additive. */
  product_footprint_kgco2e: number;
}

/** Packed pieces at one Site for one product in one month. The repair rate divides by them. */
export interface PackedPiecesFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  packed_pieces: number;
}

/** The Customer's allocated textile waste at one Site, for one product and laundry, in one month (A003). */
export interface WasteFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  laundry_id: string;
  allocated_textile_waste_kg: number;
  /** Share of laundry washed kg times the laundry's kg for each treatment route. */
  allocated_recycling_kg: number;
  allocated_reuse_kg: number;
  allocated_energy_recovery_kg: number;
  allocated_incineration_kg: number;
}

/** A laundry's fixed textile waste factor. For Data transparency only, not a Customer KPI (ADR 0012). */
export interface LaundryWasteFactor {
  laundry_id: string;
  waste_g_per_washed_kg: number;
}

export interface OperationalCircularityDefaults {
  /** Replacements postponed per repair (A002). The KPI layer multiplies repair_count by it. */
  postponement_ratio: number;
}

export interface OperationalCircularityKpis {
  defaults: OperationalCircularityDefaults;
  repairs: RepairFact[];
  packed_pieces: PackedPiecesFact[];
  waste: WasteFact[];
  laundry_waste_factors: LaundryWasteFactor[];
}

export function getOperationalCircularityKpis(): ProcessedFile<OperationalCircularityKpis> {
  return readProcessed<OperationalCircularityKpis>("operational-circularity-kpis");
}

// service-kpis.json

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

export interface DataTransparencyNote {
  id: string;
  view: View;
  text: string;
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

// public-reference.json

/** A published range, for example 4.5 to 22 L/kg. */
export interface PublicRange {
  low: number;
  high: number;
}

/** Where a public figure is used. */
export type PublicFigureUse = "context_line" | "data_transparency" | "team_assumption_rationale";

/** A citable published figure about Lindström or the textile service industry. Never a Customer's own value. */
export interface PublicFigure {
  id: string;
  name: string;
  value: number | PublicRange;
  unit: string;
  scope: string;
  source: string;
  url: string | null;
  page: string | null;
  /** The year the figure describes. For an undated page, the year it was read. */
  year: number;
  /** How far the figure applies to the dataset. */
  applicability: string;
  used_in: PublicFigureUse[];
  /** True when the figure is arithmetic on published numbers, not a published number itself. */
  derived: boolean;
  data_status: "PUBLIC_REFERENCE";
}

/** A topic with no primary public source. Shown as a data gap. */
export interface PublicReferenceGap {
  id: "on_time_service_cycle_target" | "garment_sets_per_wearer" | "etsa_and_bref_laundry_figures";
  topic: string;
  finding: string;
  treatment: string;
}

/** A note that only the KAM view shows under a context line. */
export interface KamNote {
  text: string;
  figure_ids: string[];
}

/** A line of public context shown under an evidence area. It is not a KPI. */
export interface ContextLine {
  text: string;
  evidence_area: string;
  view: View;
  data_status: "PUBLIC_REFERENCE";
  figure_ids: string[];
  kam_notes: KamNote[];
  caveats: string[];
}

export interface PublicReference {
  figures: PublicFigure[];
  gaps: PublicReferenceGap[];
  context_lines: {
    group_emissions_intensity: ContextLine;
  };
}

export function getPublicReference(): ProcessedFile<PublicReference> {
  return readProcessed<PublicReference>("public-reference");
}

// account-health.json

/** An account health rating. "not_rated" when no input has enough volume, never green. */
export type HealthRating = "green" | "amber" | "red" | "not_rated";

export type AccountHealthInputId =
  | "account_health_on_time_service_cycle_share"
  | "account_health_service_requests_per_100_wearers_per_month"
  | "account_health_scan_coverage";

/** An input's thresholds and guard. All TEAM_ASSUMPTION, and each one is an override parameter. */
export interface HealthThresholds {
  /** "higher": green at value >= green_threshold, amber at >= amber_threshold. "lower": the same with <=. */
  better: "higher" | "lower";
  green_threshold: number;
  amber_threshold: number;
  /** Below this volume the input is not rated and drops out. */
  minimum_volume: number;
}

/** A catalogue entry of account-health.json. The 3 input entries also carry their thresholds. */
export interface AccountHealthCatalogueEntry extends CatalogueEntry {
  threshold_data_status: "TEAM_ASSUMPTION";
  rationale: string;
  thresholds?: HealthThresholds;
}

export interface HealthInputResult {
  input_id: AccountHealthInputId;
  /** Shares as fractions (0.969), requests per 100 wearers per month as a number. null with no data. */
  value: number | null;
  rating: HealthRating;
  thresholds_used: HealthThresholds;
  /** Sampled cycles, wearer-months or monthly average allocated pieces, following the input. */
  volume: number;
  not_rated_reason: string | null;
}

/** The rating of one Customer or Site for one period. A Customer is rated from its own aggregates, never its Sites. */
export interface AccountHealthRating {
  scope: "customer" | "site";
  /** A customer_id or a site_id, following scope. */
  scope_id: string;
  customer_id: string;
  /** A "YYYY-MM" month or a "YYYY" year. */
  period: string;
  rating: HealthRating;
  /** Names every amber or red input, for example "Amber: on-time service cycles 96.9%." */
  reason: string;
  rated_inputs: number;
  total_inputs: number;
  /** For example "Based on 1 of 2 inputs". */
  based_on: string;
  /** 3 inputs for a Customer; on-time share and scan coverage for a Site. */
  inputs: HealthInputResult[];
}

export interface AccountHealth {
  defaults: Record<AccountHealthInputId, HealthThresholds>;
  ratings: AccountHealthRating[];
  /** Customer Experience (CSAT, NPS), shown beside the rating. Never an input. */
  customer_experience_gap: { view: View; text: string };
}

export function getAccountHealth(): ProcessedFile<AccountHealth, AccountHealthCatalogueEntry> {
  return readProcessed<AccountHealth, AccountHealthCatalogueEntry>("account-health");
}

// footprint-handprint-kpis.json

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

export type BaselineId = "B_LOCAL" | "B_HOME" | "B_INHOUSE";

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
  impacts: FootprintFact[];
  baselines: FootprintBaselines;
  handprint: HandprintRow[];
  per_wearer_denominators: PerWearerDenominator[];
  parameters: FootprintHandprintParameter[];
  transparency: FootprintTransparency;
}

export function getFootprintHandprintKpis(): ProcessedFile<FootprintHandprintKpis> {
  return readProcessed<FootprintHandprintKpis>("footprint-handprint-kpis");
}
