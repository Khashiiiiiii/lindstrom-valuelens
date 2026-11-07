// The one entry point to the calculations. Every KPI catalogue id maps to one function in its module (#12), and the
// priority, signal and first-screen functions are re-exported here (#13). views-and-review.ts imports runKpi from
// this module, so the two import each other. That is safe because neither calls the other while it loads.

import {
  accountHealth,
  accountHealthOnTimeServiceCycleShare,
  accountHealthScanCoverage,
  accountHealthServiceRequestsPer100WearersPerMonth,
  getAccountHealth,
} from "./account-health.ts";
import {
  emissionsAllocated,
  emissionsSaved,
  energySaved,
  energyUseAllocated,
  getFootprintHandprintKpis,
  washedKg,
  waterSaved,
  waterUseAllocated,
} from "./footprint-handprint-kpis.ts";
import {
  avoidedProductCo2eEstimated,
  getOperationalCircularityKpis,
  recycledOrReusedShare,
  repairRate,
  repairs,
  replacementsPostponedEstimated,
  textileWasteAllocated,
  textileWasteByTreatmentRoute,
  textileWasteDivertedFromMixedWasteEstimated,
} from "./operational-circularity-kpis.ts";
import {
  getPeriodComparisons,
  improvementOnTimeServiceCycles,
  improvementScanCoverage,
  improvementServiceRequests,
} from "./period-comparisons.ts";
import {
  activeWearers,
  allocatedGarmentsWithNoScanActivity,
  garmentsInCirculation,
  garmentsPerWearer,
  getServiceKpis,
  lateServiceCycles,
  onTimeServiceCycleShare,
  scanCoverage,
  serviceRequestFreeSiteMonths,
  serviceRequests,
  serviceRequestsPer100Wearers,
  turnaroundByStage,
  turnaroundHours90thPercentile,
  turnaroundHoursMedian,
  washesPerGarment,
} from "./service-kpis.ts";
import type { CatalogueEntry, View } from "./processed.ts";
import type { KpiAnswer, KpiFunction, KpiParameter, KpiQuery } from "./query.ts";
import { applyView, resolveScope, withheldInView } from "./query.ts";

export { defaultPriorities, priorityKpis } from "./customer-priorities.ts";
export { signalGroups, signalResults } from "./opportunity-signals.ts";
export { firstScreen, proposedNextSteps } from "./views-and-review.ts";

/** A catalogue id's function and the query parameters it reads beyond scope, period and view. */
interface Registered {
  fn: KpiFunction;
  parameters: KpiParameter[];
}

const noParameters = (fn: KpiFunction): Registered => ({ fn, parameters: [] });
const footprintParameters = (fn: KpiFunction): Registered => ({ fn, parameters: ["unit"] });
const handprintParameters = (fn: KpiFunction): Registered => ({ fn, parameters: ["baseline_id", "factor_case"] });
const repairTypeBreakdown = (fn: KpiFunction): Registered => ({ fn, parameters: ["breakdown"] });
const repairTypeAndRatio = (fn: KpiFunction): Registered => ({ fn, parameters: ["breakdown", "postponement_ratio"] });

const KPIS: Record<string, Registered> = {
  // service-kpis.json
  on_time_service_cycle_share: noParameters(onTimeServiceCycleShare),
  late_service_cycles: noParameters(lateServiceCycles),
  turnaround_hours_median: noParameters(turnaroundHoursMedian),
  turnaround_hours_90th_percentile: noParameters(turnaroundHours90thPercentile),
  turnaround_by_stage: noParameters(turnaroundByStage),
  service_requests: noParameters(serviceRequests),
  service_requests_per_100_wearers: noParameters(serviceRequestsPer100Wearers),
  service_request_free_site_months: noParameters(serviceRequestFreeSiteMonths),
  active_wearers: noParameters(activeWearers),
  garments_per_wearer: noParameters(garmentsPerWearer),
  scan_coverage: noParameters(scanCoverage),
  allocated_garments_with_no_scan_activity: noParameters(allocatedGarmentsWithNoScanActivity),
  washes_per_garment: noParameters(washesPerGarment),
  garments_in_circulation: noParameters(garmentsInCirculation),
  // operational-circularity-kpis.json
  repairs: repairTypeBreakdown(repairs),
  repair_rate: repairTypeBreakdown(repairRate),
  replacements_postponed_estimated: repairTypeAndRatio(replacementsPostponedEstimated),
  avoided_product_co2e_estimated: repairTypeAndRatio(avoidedProductCo2eEstimated),
  textile_waste_allocated: noParameters(textileWasteAllocated),
  textile_waste_by_treatment_route: { fn: textileWasteByTreatmentRoute, parameters: ["breakdown"] },
  recycled_or_reused_share: noParameters(recycledOrReusedShare),
  textile_waste_diverted_from_mixed_waste_estimated: noParameters(textileWasteDivertedFromMixedWasteEstimated),
  // footprint-handprint-kpis.json
  washed_kg: footprintParameters(washedKg),
  water_use_allocated: footprintParameters(waterUseAllocated),
  energy_use_allocated: footprintParameters(energyUseAllocated),
  emissions_allocated: { fn: emissionsAllocated, parameters: ["unit", "breakdown"] },
  water_saved: handprintParameters(waterSaved),
  energy_saved: handprintParameters(energySaved),
  emissions_saved: handprintParameters(emissionsSaved),
  // account-health.json
  account_health: noParameters(accountHealth),
  account_health_on_time_service_cycle_share: noParameters(accountHealthOnTimeServiceCycleShare),
  account_health_service_requests_per_100_wearers_per_month: noParameters(accountHealthServiceRequestsPer100WearersPerMonth),
  account_health_scan_coverage: noParameters(accountHealthScanCoverage),
  // period-comparisons.json
  improvement_on_time_service_cycles: noParameters(improvementOnTimeServiceCycles),
  improvement_service_requests: noParameters(improvementServiceRequests),
  improvement_scan_coverage: noParameters(improvementScanCoverage),
};

/** Every catalogue entry of the 5 KPI files, in file order. Throws if an entry has no function or a function no entry. */
function catalogue(): CatalogueEntry[] {
  const entries: CatalogueEntry[] = [
    ...getServiceKpis().catalogue,
    ...getOperationalCircularityKpis().catalogue,
    ...getFootprintHandprintKpis().catalogue,
    ...getAccountHealth().catalogue,
    ...getPeriodComparisons().catalogue,
  ];
  const ids = new Set(entries.map((e) => e.id));
  const missing = entries.filter((e) => !(e.id in KPIS)).map((e) => e.id);
  const extra = Object.keys(KPIS).filter((id) => !ids.has(id));
  if (missing.length || extra.length) {
    throw new Error(`Catalogue and functions disagree. No function: ${missing.join(", ") || "none"}. No entry: ${extra.join(", ") || "none"}.`);
  }
  return entries;
}

/**
 * Run one KPI for a query. Throws on an unknown id or an invalid scope. In the Customer view, a result the view
 * rule withholds (ADR 0011) returns Withheld before anything is calculated.
 */
export function runKpi(kpi_id: string, query: KpiQuery): KpiAnswer {
  const entry = catalogue().find((e) => e.id === kpi_id);
  if (!entry) throw new Error(`Unknown KPI id "${kpi_id}".`);
  resolveScope(query.scope);
  return withheldInView(entry, query.view, query.scope) ?? applyView(entry, query.view, KPIS[kpi_id].fn(query));
}

/** A KPI that runKpi accepts, with the query parameters it reads. */
export interface KpiListing {
  id: string;
  name: string;
  evidence_area: string;
  grain: string;
  view: View;
  parameters: KpiParameter[];
}

/**
 * Every catalogue entry callable in the view. The Customer view leaves out KAM-only entries. Period comparisons
 * stay, because their Customer results are shown. runKpi withholds their Site results.
 */
export function listKpis(view: KpiQuery["view"]): KpiListing[] {
  return catalogue()
    .filter((e) => view === "KAM" || e.view !== "KAM")
    .map((e) => ({
      id: e.id,
      name: e.name,
      evidence_area: e.evidence_area,
      grain: e.grain,
      view: e.view,
      parameters: [...KPIS[e.id].parameters],
    }));
}
