// Master data (#2).

import type { DataStatus, Month, ProcessedFile } from "./processed.ts";
import { readProcessed } from "./processed.ts";

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

export type BaselineId = "B_LOCAL" | "B_HOME" | "B_INHOUSE";

/** A washing alternative that a handprint compares against. */
export interface Baseline {
  baseline_id: BaselineId;
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
  default_baseline_id: BaselineId;
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
