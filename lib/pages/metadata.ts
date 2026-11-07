// The app metadata (#26): what the menu, the selects and the tiles need beyond the page figures.

import type { CustomerPriorityId, DataStatus, KpiListing, Month } from "../data.ts";
import { defaultPriorities, getCustomerPriorities, getMasterData, getOpportunitySignals, listKpis } from "../data.ts";
import type { PageRequest } from "./request.ts";

export interface Metadata {
  /** Every Customer, with the priorities a Customer switch loads. */
  customers: { customer_id: string; customer_name: string; industry: string; default_priorities: CustomerPriorityId[] }[];
  /** The request Customer's Sites. */
  sites: { site_id: string; site_name: string; customer_id: string; data_status: DataStatus }[];
  months: Month[];
  /** The 7 Customer priorities in catalogue order. */
  priorities: { id: CustomerPriorityId; name: string }[];
  /** The names of the opportunity signals in the view, for the Optimisation potential tile. */
  signals: { id: string; name: string; data_status: DataStatus }[];
  /** The KPIs runKpi accepts in the request view. */
  kpis: KpiListing[];
}

/** The metadata for the request's Customer and view. The Customer view leaves out KAM-only signals (ADR 0011). */
export function metadataPage({ customer_id, view }: PageRequest): Metadata {
  const master = getMasterData().data;
  return {
    customers: master.customers.map((c) => ({
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      industry: c.industry,
      default_priorities: defaultPriorities(c.customer_id),
    })),
    sites: master.sites
      .filter((s) => s.customer_id === customer_id)
      .map((s) => ({ site_id: s.site_id, site_name: s.site_name, customer_id: s.customer_id, data_status: s.data_status })),
    months: [...master.months],
    priorities: getCustomerPriorities().catalogue.map((p) => ({ id: p.id, name: p.name })),
    signals: getOpportunitySignals()
      .catalogue.filter((s) => view === "KAM" || s.view !== "KAM")
      .map((s) => ({ id: s.id, name: s.name, data_status: s.data_status })),
    kpis: listKpis(view),
  };
}
