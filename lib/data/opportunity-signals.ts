// Opportunity signals (#8), and their results and signal groups for a Customer (#13).

import type { CustomerPriorityId } from "./customer-priorities.ts";
import { resolvePriorities } from "./customer-priorities.ts";
import type { CatalogueEntry, Month, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiQuery, Scope } from "./query.ts";
import { resolveScope } from "./query.ts";

export type SignalId =
  | "garment_allocation_above_peers"
  | "allocated_garments_with_no_scan_activity_above_peers"
  | "washes_per_garment_above_peers"
  | "service_request_rate_above_peers"
  | "late_service_cycles_above_peers"
  | "repair_rate_above_peers";

export type LeverOwner = "Customer" | "Lindström" | "Joint";

/**
 * A signal's threshold and guards, all TEAM_ASSUMPTION override parameters. threshold is the relative gap
 * to the peer median at which the signal fires; each minimum_* key is a guard on the unit's volume.
 */
export type SignalThresholds = { threshold: number } & Record<`minimum_${string}`, number>;

/** An opportunity signal: a fixed rule that flags a Site, or a Site and product, against the Customer's other Sites. */
export interface SignalCatalogueEntry extends CatalogueEntry {
  id: SignalId;
  threshold_data_status: "TEAM_ASSUMPTION";
  rationale: string;
  /** The KPIs the signal reads, as catalogue ids from the other processed files. */
  kpi_ids: string[];
  comparison: string;
  rule: string;
  thresholds: SignalThresholds;
  /** Each guard: its parameter in thresholds, its default and what it counts. */
  minimum_volume: { parameter: string; value: number; counts: string }[];
  lever: string;
  lever_owner: LeverOwner;
  customer_priority_ids: CustomerPriorityId[];
  /** What the size figure measures, for signals 1 to 3. null for the others. */
  size: string | null;
}

/** The size figure of signals 1 to 3. Amounts above the peer level are null unless the unit is above its peers. */
export type SignalSize =
  | { garments_above_peer_level: number | null }
  | { allocated_garments_with_no_scan_activity: number }
  | {
      data_status: "ALLOCATED_ESTIMATE_SYNTHETIC";
      water_l_above_peer_level: number | null;
      emissions_kgco2e_above_peer_level: number | null;
    };

export interface TurnaroundByStage {
  median_pickup_to_in_laundry_hours: number;
  median_in_laundry_to_out_laundry_hours: number;
  median_out_laundry_to_delivered_hours: number;
}

/** One Site, or Site and product, evaluated against the median of the Customer's other Sites. */
export interface SignalResult {
  signal_id: SignalId;
  customer_id: string;
  site_id: string;
  /** null for a Site-grain signal. */
  product_id: string | null;
  value: number | null;
  /** Median of the Customer's other Sites, for the same product where the signal is by product. */
  peer_median: number | null;
  peer_count: number;
  /** (value minus peer median) divided by peer median. null when not evaluated. */
  gap: number | null;
  /** The guard volume: active wearers or allocated pieces (monthly average), wearer-months, sampled cycles or packed pieces. */
  volume: number;
  /** Service requests, late cycles or repairs for the signals with an event guard, otherwise null. */
  events: number | null;
  fired: boolean;
  not_evaluated_reason: string | null;
  /** "KAM" for signal 4 and for every unfired or not evaluated result. */
  view: View;
  size: SignalSize | null;
  /** Signal 5 only: the Site's median hours per stage. */
  turnaround_by_stage?: TurnaroundByStage | null;
}

export interface SignalEvaluation {
  signal_id: SignalId;
  /** Evaluated results by gap, largest first, then the not evaluated ones. */
  results: SignalResult[];
}

export interface RankedSignal {
  rank: number;
  signal_id: SignalId;
  site_id: string;
  product_id: string | null;
  gap: number;
  /** The signal's highest priority in the Customer's default order, or null when it matches none. */
  matched_priority_id: CustomerPriorityId | null;
}

/** A Customer's fired signals by priority position, then by gap. Signals on the same Site stay separate. */
export interface CustomerSignalRanking {
  customer_id: string;
  priority_order: CustomerPriorityId[];
  results: RankedSignal[];
}

export interface SiteProductMonthInput {
  customer_id: string;
  site_id: string;
  product_id: string;
  month: Month;
  /** The product row value. */
  active_wearers: number;
  allocated_pieces: number;
  washed_pieces: number;
  packed_pieces: number;
  repairs: number;
  allocated_water_l: number;
  allocated_emissions_kgco2e: number;
}

export interface SiteMonthInput {
  customer_id: string;
  site_id: string;
  month: Month;
  /** By the wearer counting rule: the largest product row. */
  active_wearers: number;
  allocated_pieces: number;
  active_assets_scanned: number;
  service_requests: number;
  sampled_cycles: number;
  late_cycles: number;
}

/** The fired results of one signal for one Customer, in the view. */
export interface SignalGroup {
  rank: number;
  signal_id: SignalId;
  lever: string;
  lever_owner: LeverOwner;
  /** The signal's highest priority in the Customer's order, or null when it matches none. */
  matched_priority_id: CustomerPriorityId | null;
  largest_gap: number;
  fired_count: number;
  /** By gap, largest first. product_id is null for a Site-grain signal. */
  results: { site_id: string; product_id: string | null; gap: number }[];
}

export interface OpportunitySignals {
  defaults: { period: string; minimum_peers: number; signals: Record<SignalId, SignalThresholds> };
  evaluations: SignalEvaluation[];
  ranking: CustomerSignalRanking[];
  /** Additive month components, so a later layer can re-evaluate with overrides or another period. */
  inputs: { site_product_month: SiteProductMonthInput[]; site_month: SiteMonthInput[] };
}

export function getOpportunitySignals(): ProcessedFile<OpportunitySignals, SignalCatalogueEntry> {
  return readProcessed<OpportunitySignals, SignalCatalogueEntry>("opportunity-signals");
}

export interface SignalQuery extends Pick<Scope, "customer_id" | "site_id"> {
  view: KpiQuery["view"];
}

/**
 * A Customer's 2025 signal results, one per Site or Site and product, in evaluation order. The Customer view
 * returns fired results only and leaves out signal 4 (ADR 0011). Each stored result's view says which.
 */
export function signalResults({ customer_id, site_id, view }: SignalQuery): SignalResult[] {
  resolveScope({ customer_id, site_id });
  return getOpportunitySignals()
    .data.evaluations.flatMap((e) => e.results)
    .filter((r) => r.customer_id === customer_id && (site_id === undefined || r.site_id === site_id))
    .filter((r) => view === "KAM" || (r.fired && r.view !== "KAM"));
}

export interface SignalGroupQuery {
  customer_id: string;
  view: KpiQuery["view"];
  /** Customer priority names or ids, in order. Without it, the Customer's default priorities. */
  priorities?: string[];
}

/** Compare 2 strings by code point, the order Python's sort gives the stored groups. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A Customer's fired results in the view, grouped by signal, each group with 1 lever and its owner. Groups rank by
 * the position of their highest matching priority in `priorities`, then by largest relative gap (ADR 0008). Groups
 * that match no priority come last. Results in a group are by gap, largest first. Throws on an unknown priority.
 */
export function signalGroups({ customer_id, view, priorities }: SignalGroupQuery): SignalGroup[] {
  const order = resolvePriorities(customer_id, priorities);
  const position = (id: CustomerPriorityId | null) => (id === null ? order.length : order.indexOf(id));
  const fired = signalResults({ customer_id, view }).filter((r) => r.fired);
  const groups = getOpportunitySignals()
    .catalogue.map((signal) => {
      const results = fired
        .filter((r) => r.signal_id === signal.id)
        .map((r) => ({ site_id: r.site_id, product_id: r.product_id, gap: r.gap as number }))
        .sort((a, b) => b.gap - a.gap || compareText(a.site_id, b.site_id) || compareText(a.product_id ?? "", b.product_id ?? ""));
      const matched = order.find((id) => signal.customer_priority_ids.includes(id)) ?? null;
      return {
        signal_id: signal.id,
        lever: signal.lever,
        lever_owner: signal.lever_owner,
        matched_priority_id: matched,
        largest_gap: results[0]?.gap,
        fired_count: results.length,
        results,
      };
    })
    .filter((g) => g.fired_count > 0)
    .sort(
      (a, b) =>
        position(a.matched_priority_id) - position(b.matched_priority_id) ||
        b.largest_gap - a.largest_gap ||
        compareText(a.signal_id, b.signal_id),
    );
  return groups.map((g, i) => ({ rank: i + 1, ...g }));
}
