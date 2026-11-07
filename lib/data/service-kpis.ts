// Service performance and adoption KPIs (#3).

import type { DataTransparencyNote, Month, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

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
