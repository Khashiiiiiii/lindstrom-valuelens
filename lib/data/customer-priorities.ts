// Customer priorities (#7), and the defaults and KPI sets the first screen reads (#13).

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

/** A Customer's default priorities, in order (ADR 0006). Throws on an unknown Customer. */
export function defaultPriorities(customer_id: string): CustomerPriorityId[] {
  return [...defaultOrder(customer_id).priority_ids];
}

/** A Customer's default_order row. Throws on an unknown Customer. */
function defaultOrder(customer_id: string): DefaultPriorityOrder {
  const row = getCustomerPriorities().data.default_order.find((o) => o.customer_id === customer_id);
  if (!row) throw new Error(`Unknown customer_id "${customer_id}".`);
  return row;
}

/** The dashboard_emphasis texts for the Customer's industry, or null if it has none. KAM view only. */
export function dashboardEmphasis(customer_id: string): DashboardEmphasis | null {
  const { industry } = defaultOrder(customer_id);
  return getCustomerPriorities().data.dashboard_emphasis.find((d) => d.industry === industry) ?? null;
}

/** The catalogue entry of a Customer priority, given by its name ("Water") or its id ("water"). Throws on any other. */
function priorityEntry(priority: string): CustomerPriorityCatalogueEntry {
  const catalogue = getCustomerPriorities().catalogue;
  const entry = catalogue.find((e) => e.name === priority || e.id === priority);
  if (!entry) {
    throw new Error(`Unknown Customer priority "${priority}". Use one of ${catalogue.map((e) => e.name).join(", ")}.`);
  }
  return entry;
}

/** The KPI set of a Customer priority, given by its name or id, as catalogue ids from the KPI files. */
export function priorityKpis(priority: string): string[] {
  return [...priorityEntry(priority).kpi_ids];
}

/**
 * The priority ids for a list of priority names or ids, in order. Without a list, the Customer's default
 * priorities. Throws on an unknown or repeated priority.
 */
export function resolvePriorities(customer_id: string, priorities?: string[]): CustomerPriorityId[] {
  if (priorities === undefined) return defaultPriorities(customer_id);
  const ids = priorities.map((p) => priorityEntry(p).id);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repeated.length) throw new Error(`Customer priority "${repeated[0]}" is given more than once.`);
  return ids;
}
