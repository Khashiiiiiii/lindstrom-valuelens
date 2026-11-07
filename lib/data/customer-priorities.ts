// Customer priorities (#7).

import type { CatalogueEntry, DataStatus, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

/** One of the 7 fixed Customer priorities. */
export type CustomerPriorityId =
  | "water"
  | "emissions"
  | "circularity"
  | "service_reliability"
  | "garment_utilisation"
  | "traceability"
  | "improvement";

/** Where a source term comes from: the customer brief, the Industry_Priorities sheet or a Customer's priority_topics. */
export type PriorityTermSource = "brief" | "Industry_Priorities" | "priority_topics";

/** A Customer priority. It is not a KPI; its KPI set names KPIs in the other catalogue files. */
export interface CustomerPriorityCatalogueEntry extends CatalogueEntry {
  id: CustomerPriorityId;
  /** The source terms that map to this priority. */
  source_terms: string[];
  /** Catalogue ids from the other processed files. A KPI may sit in more than one set. */
  kpi_ids: string[];
}

export interface PriorityTerm {
  term: string;
  sources: PriorityTermSource[];
  /** "unmapped" for Hygiene, Safety and Compliance terms, which have no data. */
  priority_id: CustomerPriorityId | "unmapped";
  /** The data-gap note on an unmapped term, otherwise null. */
  note: string | null;
}

/** A Customer's default priorities. The user can still change them. */
export interface DefaultPriorityOrder {
  customer_id: string;
  industry: string;
  /** "priority_topics" when the Customer states topics; "Industry_Priorities" only when it states none. */
  source: Exclude<PriorityTermSource, "brief">;
  /** In order, without duplicates. */
  priority_ids: CustomerPriorityId[];
  /** Unmapped source terms left out of the order. */
  skipped_terms: string[];
}

/** The workbook's dashboard_emphasis texts for one industry. Synthetic, illustrative, KAM view only. */
export interface DashboardEmphasis {
  industry: string;
  view: View;
  illustrative: true;
  data_status: DataStatus;
  /** term is the Industry_Priorities theme of that rank. */
  texts: { priority_rank: number; term: string; text: string }[];
}

export interface CustomerPriorities {
  term_map: PriorityTerm[];
  default_order: DefaultPriorityOrder[];
  dashboard_emphasis: DashboardEmphasis[];
  /** "Cost" maps to Garment utilisation. Financial Value is deferred and no euro figure is shown. */
  cost_note: { term: string; priority_id: CustomerPriorityId; text: string };
}

export function getCustomerPriorities(): ProcessedFile<CustomerPriorities, CustomerPriorityCatalogueEntry> {
  return readProcessed<CustomerPriorities, CustomerPriorityCatalogueEntry>("customer-priorities");
}
