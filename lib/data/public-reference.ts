// Public reference figures (#6).

import type { ProcessedFile, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

/** A published range, for example 4.5 to 22 L/kg. */
export interface PublicRange {
  low: number;
  high: number;
}

/** Where a public figure is used. */
export type PublicFigureUse = "context_line" | "data_transparency" | "team_assumption_rationale";

/** A citable published figure about Lindström or the textile service industry. Never a Customer's own value. */
export interface PublicFigure {
  id: string;
  name: string;
  value: number | PublicRange;
  unit: string;
  scope: string;
  source: string;
  url: string | null;
  page: string | null;
  /** The year the figure describes. For an undated page, the year it was read. */
  year: number;
  /** How far the figure applies to the dataset. */
  applicability: string;
  used_in: PublicFigureUse[];
  /** True when the figure is arithmetic on published numbers, not a published number itself. */
  derived: boolean;
  data_status: "PUBLIC_REFERENCE";
}

/** A topic with no primary public source. Shown as a data gap. */
export interface PublicReferenceGap {
  id: "on_time_service_cycle_target" | "garment_sets_per_wearer" | "etsa_and_bref_laundry_figures";
  topic: string;
  finding: string;
  treatment: string;
}

/** A note that only the KAM view shows under a context line. */
export interface KamNote {
  text: string;
  figure_ids: string[];
}

/** A line of public context shown under an evidence area. It is not a KPI. */
export interface ContextLine {
  text: string;
  evidence_area: string;
  view: View;
  data_status: "PUBLIC_REFERENCE";
  figure_ids: string[];
  kam_notes: KamNote[];
  caveats: string[];
}

export interface PublicReference {
  figures: PublicFigure[];
  gaps: PublicReferenceGap[];
  context_lines: {
    group_emissions_intensity: ContextLine;
  };
}

export function getPublicReference(): ProcessedFile<PublicReference> {
  return readProcessed<PublicReference>("public-reference");
}
