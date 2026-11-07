// Account health (#9).

import type { CatalogueEntry, ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiQuery, KpiResult } from "./query.ts";
import { catalogueEntry, checkBreakdown, kpiResult, notEvaluated, precomputedPeriod, resolveScope, scopeRow } from "./query.ts";

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

// Calculations (#12). Account health returns the precomputed ratings, which exist for 2025 and single months.

function entry(id: string): AccountHealthCatalogueEntry {
  return catalogueEntry(getAccountHealth().catalogue, "account-health", id);
}

/** The precomputed rating of the query's scope and period, or the reason there is none. */
function findRating(query: KpiQuery): AccountHealthRating | string {
  const scope = resolveScope(query.scope);
  const period = precomputedPeriod(query.period);
  if (period === null) return "Account health is rated for all of 2025 and single months only.";
  if (scope.product_ids !== null) return "Account health is rated for a Customer or Site, not a product.";
  const named = scopeRow(scope);
  const rating = getAccountHealth().data.ratings.find(
    (r) => r.scope === named.scope && r.scope_id === named.scope_id && r.period === period,
  );
  return rating ?? "No account health rating exists for this scope and period.";
}

/**
 * The worst-of rating, in `detail`. The value is always null, because a rating is not a number. A "not_rated"
 * rating also sets not_evaluated_reason to the rating's reason. KAM view only.
 */
export function accountHealth(query: KpiQuery): KpiResult {
  checkBreakdown("account_health", query, []);
  const rating = findRating(query);
  if (typeof rating === "string") return notEvaluated(entry("account_health"), query, "rating", rating);
  return kpiResult(entry("account_health"), query, {
    value: null,
    unit: "rating",
    not_evaluated_reason: rating.rating === "not_rated" ? rating.reason : null,
    detail: { kind: "account_health", rating },
  });
}

/** One account health input: its value and volume, with its rating and thresholds in `detail`. */
function healthInput(input_id: AccountHealthInputId, query: KpiQuery, unit: string): KpiResult {
  checkBreakdown(input_id, query, []);
  const rating = findRating(query);
  if (typeof rating === "string") return notEvaluated(entry(input_id), query, unit, rating);
  const input = rating.inputs.find((i) => i.input_id === input_id);
  if (!input) return notEvaluated(entry(input_id), query, unit, "This input is rated for a Customer only, not a Site.");
  return kpiResult(entry(input_id), query, {
    value: input.value,
    unit,
    volume: input.volume,
    not_evaluated_reason: input.value === null ? (input.not_rated_reason ?? "No data in the period.") : null,
    detail: { kind: "account_health_input", input },
  });
}

/** The on-time service cycle share input. KAM view only. */
export function accountHealthOnTimeServiceCycleShare(query: KpiQuery): KpiResult {
  return healthInput("account_health_on_time_service_cycle_share", query, "share");
}

/** The service requests per 100 wearers per month input. Customer only. KAM view only. */
export function accountHealthServiceRequestsPer100WearersPerMonth(query: KpiQuery): KpiResult {
  return healthInput("account_health_service_requests_per_100_wearers_per_month", query, "per 100 wearers per month");
}

/** The scan coverage input. KAM view only. */
export function accountHealthScanCoverage(query: KpiQuery): KpiResult {
  return healthInput("account_health_scan_coverage", query, "share");
}
