// Account health (#9).

import type { CatalogueEntry, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

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
