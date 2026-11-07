// Operational and circularity KPIs (#4).

import type { Month, ProcessedFile } from "./processed.ts";
import { readProcessed } from "./processed.ts";

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
