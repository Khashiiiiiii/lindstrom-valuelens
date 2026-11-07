// Operational and circularity KPIs (#4).

import { getMasterData } from "./master-data.ts";
import type { CatalogueEntry, Month, ProcessedFile } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiQuery, KpiResult } from "./query.ts";
import {
  catalogueEntry,
  checkBreakdown,
  inScope,
  kpiResult,
  notEvaluated,
  periodMonths,
  resolveScope,
  sum,
  sumBy,
} from "./query.ts";

/** The workbook's repair types. */
export type RepairType = "BUTTON" | "DARNING / PATCHING" | "OTHER ACCESSORIES" | "OTHER SEAM STITCHING" | "ZIPPER";

/** Repairs at one Site, for one product and repair type, in one month. */
export interface RepairFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  repair_type: RepairType;
  repair_count: number;
  /** kg CO2e of one new garment of this product, from Products (A005). Not additive. */
  product_footprint_kgco2e: number;
}

/** Packed pieces at one Site for one product in one month. The repair rate divides by them. */
export interface PackedPiecesFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  packed_pieces: number;
}

/** The Customer's allocated textile waste at one Site, for one product and laundry, in one month (A003). */
export interface WasteFact {
  month: Month;
  customer_id: string;
  site_id: string;
  product_id: string;
  laundry_id: string;
  allocated_textile_waste_kg: number;
  /** Share of laundry washed kg times the laundry's kg for each treatment route. */
  allocated_recycling_kg: number;
  allocated_reuse_kg: number;
  allocated_energy_recovery_kg: number;
  allocated_incineration_kg: number;
}

/** A laundry's fixed textile waste factor. For Data transparency only, not a Customer KPI (ADR 0012). */
export interface LaundryWasteFactor {
  laundry_id: string;
  waste_g_per_washed_kg: number;
}

export interface OperationalCircularityDefaults {
  /** Replacements postponed per repair (A002). The KPI layer multiplies repair_count by it. */
  postponement_ratio: number;
}

export interface OperationalCircularityKpis {
  defaults: OperationalCircularityDefaults;
  repairs: RepairFact[];
  packed_pieces: PackedPiecesFact[];
  waste: WasteFact[];
  laundry_waste_factors: LaundryWasteFactor[];
}

export function getOperationalCircularityKpis(): ProcessedFile<OperationalCircularityKpis> {
  return readProcessed<OperationalCircularityKpis>("operational-circularity-kpis");
}

// Calculations (#12). Repair and waste KPIs sum the month facts over the period, then build ratios from the totals.

function entry(id: string): CatalogueEntry {
  return catalogueEntry(getOperationalCircularityKpis().catalogue, "operational-circularity-kpis", id);
}

function repairFacts(query: KpiQuery): RepairFact[] {
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  return getOperationalCircularityKpis().data.repairs.filter((f) => inScope(f, scope, months));
}

function wasteFacts(query: KpiQuery): WasteFact[] {
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  return getOperationalCircularityKpis().data.waste.filter((f) => inScope(f, scope, months));
}

/** The postponement ratio of the query, or the file's default (A002). Throws on a negative or non-finite ratio. */
function postponementRatio(query: KpiQuery): number {
  const ratio = query.postponement_ratio ?? getOperationalCircularityKpis().data.defaults.postponement_ratio;
  if (!Number.isFinite(ratio) || ratio < 0) throw new Error(`postponement_ratio must be 0 or more, not ${ratio}.`);
  return ratio;
}

/** A field summed per repair type, in repair type order. */
function byRepairType(facts: RepairFact[], field: (f: RepairFact) => number): { key: string; value: number }[] {
  return sumBy(facts, (f) => f.repair_type, field).sort((a, b) => a.key.localeCompare(b.key));
}

/** A repair KPI: a sum over repair facts, with repair type as an optional breakdown. */
function repairSum(kpi_id: string, query: KpiQuery, unit: string, field: (f: RepairFact) => number, caveats: string[] = []): KpiResult {
  const breakdown = checkBreakdown(kpi_id, query, ["repair_type"]);
  const facts = repairFacts(query);
  return kpiResult(entry(kpi_id), query, {
    value: sum(facts, field),
    unit,
    breakdown: breakdown ? byRepairType(facts, field) : null,
    caveats,
  });
}

/** Sum of repair_count over the period. Repair type is a breakdown. */
export function repairs(query: KpiQuery): KpiResult {
  return repairSum("repairs", query, "count", (f) => f.repair_count);
}

/** Summed repairs per 1,000 summed packed pieces. Repair type is a breakdown over the same packed pieces. */
export function repairRate(query: KpiQuery): KpiResult {
  const breakdown = checkBreakdown("repair_rate", query, ["repair_type"]);
  const scope = resolveScope(query.scope);
  const months = periodMonths(query.period);
  const unit = "per 1,000 packed pieces";
  const packed = sum(
    getOperationalCircularityKpis().data.packed_pieces.filter((f) => inScope(f, scope, months)),
    (f) => f.packed_pieces,
  );
  if (packed === 0) return notEvaluated(entry("repair_rate"), query, unit, "No packed pieces in the period.");
  const facts = repairFacts(query);
  const perThousand = (count: number) => (1000 * count) / packed;
  return kpiResult(entry("repair_rate"), query, {
    value: perThousand(sum(facts, (f) => f.repair_count)),
    unit,
    volume: packed,
    breakdown: breakdown
      ? byRepairType(facts, (f) => f.repair_count).map((b) => ({ key: b.key, value: perThousand(b.value) }))
      : null,
  });
}

/** Repairs times the postponement ratio (A002). */
export function replacementsPostponedEstimated(query: KpiQuery): KpiResult {
  const ratio = postponementRatio(query);
  return repairSum("replacements_postponed_estimated", query, "count", (f) => f.repair_count * ratio, [
    `Postponement ratio used: ${ratio}.`,
  ]);
}

/** Replacements postponed times the product footprint (A002, A005). Never added to Emissions saved (ADR 0007). */
export function avoidedProductCo2eEstimated(query: KpiQuery): KpiResult {
  const ratio = postponementRatio(query);
  return repairSum(
    "avoided_product_co2e_estimated",
    query,
    "kg CO2e",
    (f) => f.repair_count * ratio * f.product_footprint_kgco2e,
    [`Postponement ratio used: ${ratio}.`],
  );
}

const ROUTES: { key: string; field: (f: WasteFact) => number }[] = [
  { key: "recycling", field: (f) => f.allocated_recycling_kg },
  { key: "reuse", field: (f) => f.allocated_reuse_kg },
  { key: "energy_recovery", field: (f) => f.allocated_energy_recovery_kg },
  { key: "incineration", field: (f) => f.allocated_incineration_kg },
];

const recycledOrReusedKg = (f: WasteFact) => f.allocated_recycling_kg + f.allocated_reuse_kg;

/** Sum of allocated_textile_waste_kg over the period (A003). */
export function textileWasteAllocated(query: KpiQuery): KpiResult {
  checkBreakdown("textile_waste_allocated", query, []);
  return kpiResult(entry("textile_waste_allocated"), query, {
    value: sum(wasteFacts(query), (f) => f.allocated_textile_waste_kg),
    unit: "kg",
  });
}

/** Allocated kg of each treatment route, always as a breakdown. The value is the sum of the routes. */
export function textileWasteByTreatmentRoute(query: KpiQuery): KpiResult {
  checkBreakdown("textile_waste_by_treatment_route", query, ["treatment_route"]);
  const facts = wasteFacts(query);
  const routes = ROUTES.map((r) => ({ key: r.key, value: sum(facts, r.field) }));
  return kpiResult(entry("textile_waste_by_treatment_route"), query, {
    value: sum(routes, (r) => r.value),
    unit: "kg",
    breakdown: routes,
    caveats: [
      "Each route is the Customer's share of the laundry's route kg, while Textile waste (allocated) is a workbook " +
        "figure rounded on each row. So the two totals can differ by a few kg.",
    ],
  });
}

/** Allocated recycling plus reuse kg divided by allocated textile waste kg, from summed totals. */
export function recycledOrReusedShare(query: KpiQuery): KpiResult {
  checkBreakdown("recycled_or_reused_share", query, []);
  const facts = wasteFacts(query);
  const waste = sum(facts, (f) => f.allocated_textile_waste_kg);
  if (waste === 0) return notEvaluated(entry("recycled_or_reused_share"), query, "share", "No textile waste in the period.");
  return kpiResult(entry("recycled_or_reused_share"), query, {
    value: sum(facts, recycledOrReusedKg) / waste,
    unit: "share",
    volume: waste,
  });
}

/** Recycled or reused kg that the default baseline sends to mixed waste (A004: mixed_waste_share of 1). */
export function textileWasteDivertedFromMixedWasteEstimated(query: KpiQuery): KpiResult {
  checkBreakdown("textile_waste_diverted_from_mixed_waste_estimated", query, []);
  const master = getMasterData().data;
  const baseline = master.baselines.find((b) => b.baseline_id === master.default_baseline_id);
  if (!baseline) throw new Error(`master-data.json has no default baseline "${master.default_baseline_id}".`);
  return kpiResult(entry("textile_waste_diverted_from_mixed_waste_estimated"), query, {
    value: sum(wasteFacts(query), recycledOrReusedKg) * baseline.mixed_waste_share,
    unit: "kg",
  });
}
