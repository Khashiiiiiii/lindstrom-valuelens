// Views, first screen and exported review (#11).

import type { CustomerPriorityId } from "./customer-priorities.ts";
import type { LeverOwner, SignalId } from "./opportunity-signals.ts";
import type { CatalogueEntry, DataStatus, ProcessedFile, ReviewPart, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";

/** A pointer into another processed file: ids in its catalogue, or a dotted key in its data. */
export type ProcessedRef =
  | { file: string; catalogue_ids: string[] }
  | { file: string; data_key: string }
  | { file: string; data_key: string; id_field: string; ids: string[] };

/** An entry of a view list, tile list, Data transparency list or review part list. */
export interface ViewItem {
  id: string;
  name: string;
  text: string;
  /** Every ref names an id the other files hold; the build stops otherwise. */
  refs: ProcessedRef[];
}

export interface DataStatusLegendEntry {
  data_status: DataStatus;
  text: string;
}

/** A Data transparency item. The legend and the data gaps carry their rows in entries. */
export interface DataTransparencyItem extends ViewItem {
  entries?: DataStatusLegendEntry[] | ViewItem[] | ThresholdAndGuard[];
}

/** A catalogue entry with TEAM_ASSUMPTION thresholds, listed in the KAM version of Data transparency. */
export interface ThresholdAndGuard {
  file: string;
  catalogue_id: string;
  rationale: string;
}

export interface ViewsConfig {
  /** Every item not listed in kam_only shows in both views. */
  default_view: "Both";
  default_text: string;
  prompt_answers_text: string;
  kam_only: ViewItem[];
  data_transparency: {
    customer: { items: DataTransparencyItem[] };
    /** The Customer items first, then the KAM additions. */
    kam: { items: DataTransparencyItem[] };
  };
}

export interface FirstScreenTile extends ViewItem {
  position: number;
  /** The brief's first-screen candidate the tile answers. */
  brief_candidate: string;
  kpi_ids: string[];
  /** Emissions saved and Water saved only: the "may be overstated" caveats, per KPI. */
  caveats?: { kpi_id: string; caveat: string }[];
}

export interface HeadlineKpis {
  priority_id: CustomerPriorityId;
  kpi_ids: string[];
  notes: string[];
  refs: ProcessedRef[];
}

export interface FirstScreen {
  /** The same 9 tiles for every Customer and priority, in order. */
  common_tiles: FirstScreenTile[];
  /** KAM view only: account health and dashboard_emphasis. */
  kam_additions: ViewItem[];
  priority_blocks: { max_blocks: number; rules: string[]; headline_kpis: HeadlineKpis[] };
  signal_group_rules: string[];
}

export type SplitGroup = "evidence_and_value" | "future_planning";

export interface ReviewPartConfig extends ViewItem {
  name: ReviewPart;
  split_group: SplitGroup;
  evidence_areas: string[];
  /** The Customer-view catalogue entries of every file whose review_part is this part. */
  catalogue_refs: { file: string; catalogue_ids: string[] }[];
}

export interface ReviewConfig {
  /** The export follows the Customer view's content rules. */
  follows_view: "Customer";
  rules: string[];
  /** 65% and 35%, a page-count target. */
  split: { split_group: SplitGroup; page_share: number; part_ids: string[] }[];
  parts: ReviewPartConfig[];
  proposed_next_step_rules: string[];
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

export interface PriorityBlock {
  position: number;
  priority_id: CustomerPriorityId;
  kpi_ids: string[];
  skipped_kpis: { kpi_id: string; reason: "on_common_row" | "kam_only" }[];
  /** The top-ranked signal group matching the priority, or null. */
  signal_group_signal_id: SignalId | null;
}

/** A fired signal group's lever, offered for the KAM and the Customer to agree. It has no date. */
export interface ProposedNextStep {
  position: number;
  signal_id: SignalId;
  lever: string;
  lever_owner: LeverOwner;
  results: { site_id: string; product_id: string | null }[];
  status: "proposed";
  status_text: string;
}

export interface ResolvedView {
  optimisation_potential: {
    fired_count: number;
    signal_count: number;
    top_signal_group_signal_id: SignalId | null;
  };
  signal_groups: SignalGroup[];
  priority_blocks: PriorityBlock[];
  proposed_next_steps: ProposedNextStep[];
}

/** A Customer's resolved content for its default priorities. */
export interface CustomerViewDefaults {
  customer_id: string;
  priority_ids: CustomerPriorityId[];
  views: Record<Exclude<View, "Both">, ResolvedView>;
  export: { follows_view: "Customer"; site_breakdown_kpi_ids: string[] };
}

export interface ViewsAndReview {
  period: string;
  views: ViewsConfig;
  first_screen: FirstScreen;
  review: ReviewConfig;
  defaults_by_customer: CustomerViewDefaults[];
}

export function getViewsAndReview(): ProcessedFile<ViewsAndReview, CatalogueEntry> {
  return readProcessed<ViewsAndReview, CatalogueEntry>("views-and-review");
}
