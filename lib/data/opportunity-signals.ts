// Opportunity signals (#8).

import type { CustomerPriorityId } from "./customer-priorities.ts";
import type { CatalogueEntry, Month, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

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
