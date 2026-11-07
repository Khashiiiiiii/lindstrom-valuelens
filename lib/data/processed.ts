// Shared reader, cache and catalogue types for every file in data/processed/ (#2).

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A "YYYY-MM" month string, for example "2025-01". */
export type Month = string;

/** How a value was obtained. Values used by the workbook and the KPI catalogue. */
export type DataStatus =
  | "SYNTHETIC"
  | "SYNTHETIC_ESTIMATE"
  | "SYNTHETIC_STRUCTURALLY_REPRESENTATIVE"
  | "ALLOCATED_ESTIMATE_SYNTHETIC"
  | "PUBLIC_REFERENCE"
  | "TEAM_ASSUMPTION";

export type View = "KAM" | "Customer" | "Both";

export type ReviewPart = "Look back" | "Show value" | "Build trust" | "Look forward" | "Agree actions";

/** One KPI, opportunity signal, period comparison or rule in a file's catalogue. */
/** A KAM note on how the data was handled, for example rows that fall outside the data months. */
export interface DataTransparencyNote {
  id: string;
  view: View;
  text: string;
}

export interface CatalogueEntry {
  id: string;
  name: string;
  evidence_area: string;
  core_or_industry: "Core KPI";
  customer_question: string;
  definition: string;
  source_fields: string[];
  grain: string;
  view: View;
  review_part: ReviewPart;
  data_status: DataStatus;
  assumptions: string[];
  caveats: string[];
}

export interface ProcessedMeta {
  /** The file name without ".json", for example "master-data". */
  name: string;
  source_file: string;
  /** SHA-256 of the source workbook. */
  source_sha256: string;
}

export interface ProcessedFile<TData, TEntry extends CatalogueEntry = CatalogueEntry> {
  meta: ProcessedMeta;
  catalogue: TEntry[];
  data: TData;
}

const PROCESSED_DIR = join(process.cwd(), "data", "processed");
const cache = new Map<string, unknown>();

/** Read data/processed/<name>.json once per process and return the parsed file. */
export function readProcessed<TData, TEntry extends CatalogueEntry = CatalogueEntry>(
  name: string,
): ProcessedFile<TData, TEntry> {
  let file = cache.get(name);
  if (file === undefined) {
    file = JSON.parse(readFileSync(join(PROCESSED_DIR, `${name}.json`), "utf-8"));
    cache.set(name, file);
  }
  return file as ProcessedFile<TData, TEntry>;
}
