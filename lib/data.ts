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

export interface ProcessedFile<TData> {
  meta: ProcessedMeta;
  catalogue: CatalogueEntry[];
  data: TData;
}

const PROCESSED_DIR = join(process.cwd(), "data", "processed");
const cache = new Map<string, unknown>();

/** Read data/processed/<name>.json once per process and return the parsed file. */
export function readProcessed<TData>(name: string): ProcessedFile<TData> {
  let file = cache.get(name);
  if (file === undefined) {
    file = JSON.parse(readFileSync(join(PROCESSED_DIR, `${name}.json`), "utf-8"));
    cache.set(name, file);
  }
  return file as ProcessedFile<TData>;
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
