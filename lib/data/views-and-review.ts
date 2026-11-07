// Views, first screen and exported review (#11), and the first screen and next steps for any priorities (#13).

import { listKpis, runKpi } from "./calculations.ts";
import type { CustomerPriorityId, DashboardEmphasis } from "./customer-priorities.ts";
import { dashboardEmphasis, resolvePriorities } from "./customer-priorities.ts";
import { getMasterData } from "./master-data.ts";
import type { LeverOwner, SignalGroup, SignalGroupQuery, SignalId } from "./opportunity-signals.ts";
import { getOpportunitySignals, signalGroups } from "./opportunity-signals.ts";
import type { CatalogueEntry, DataStatus, ProcessedFile, ReviewPart, View } from "./processed.ts";
import { readProcessed } from "./processed.ts";
import type { KpiAnswer, KpiQuery, Period, Scope } from "./query.ts";
import { resolveScope } from "./query.ts";

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

const MAX_NEXT_STEPS = 3;
const PROPOSED_TEXT = "Proposed, to be agreed in the meeting.";

/**
 * The top 3 signal groups for the priorities, or fewer if fewer fire, each as 1 proposed next step with the
 * signal's lever owner and no date. Throws on an unknown priority.
 */
export function proposedNextSteps(query: SignalGroupQuery): ProposedNextStep[] {
  return signalGroups(query)
    .slice(0, MAX_NEXT_STEPS)
    .map((g) => ({
      position: g.rank,
      signal_id: g.signal_id,
      lever: g.lever,
      lever_owner: g.lever_owner,
      results: g.results.map((r) => ({ site_id: r.site_id, product_id: r.product_id })),
      status: "proposed",
      status_text: PROPOSED_TEXT,
    }));
}

export interface FirstScreenQuery extends SignalGroupQuery, Pick<Scope, "site_id"> {
  /** The period of the tile and block KPIs. Signal groups are 2025 only, as stored. */
  period: Period;
}

/** A common tile with its KPIs' answers, in kpi_ids order. Site count and Optimisation potential have none. */
export interface TileResult extends FirstScreenTile {
  answers: KpiAnswer[];
}

/** A priority block with its KPIs' answers, in kpi_ids order. */
export interface PriorityBlockResult extends PriorityBlock {
  answers: KpiAnswer[];
}

/** The first screen for one Customer, view, period and priority order. */
export interface FirstScreenResult {
  customer_id: string;
  view: KpiQuery["view"];
  period: Period;
  priority_ids: CustomerPriorityId[];
  tiles: TileResult[];
  /** The Site count tile's figure. */
  site_count: number;
  optimisation_potential: ResolvedView["optimisation_potential"];
  priority_blocks: PriorityBlockResult[];
  /** KAM view only, else null. dashboard_emphasis is null when the Customer's industry has none. */
  kam_additions: { account_health: KpiAnswer; dashboard_emphasis: DashboardEmphasis | null } | null;
}

/**
 * Up to 3 priority blocks, in priority order. A block skips headline KPIs on the common row and, in the Customer
 * view, KAM-only KPIs. It names the top-ranked group in `groups` whose signal matches the priority, or null.
 */
function priorityBlocks(order: CustomerPriorityId[], view: KpiQuery["view"], groups: SignalGroup[]): PriorityBlock[] {
  const { common_tiles, priority_blocks } = getViewsAndReview().data.first_screen;
  const common = new Set(common_tiles.flatMap((t) => t.kpi_ids));
  const kamOnly = new Set(listKpis("KAM").filter((k) => k.view === "KAM").map((k) => k.id));
  const signals = getOpportunitySignals().catalogue;
  return order.slice(0, priority_blocks.max_blocks).map((priority_id, i) => {
    const headline = priority_blocks.headline_kpis.find((h) => h.priority_id === priority_id)!;
    const kpi_ids: string[] = [];
    const skipped_kpis: PriorityBlock["skipped_kpis"] = [];
    for (const kpi_id of headline.kpi_ids) {
      if (common.has(kpi_id)) skipped_kpis.push({ kpi_id, reason: "on_common_row" });
      else if (view === "Customer" && kamOnly.has(kpi_id)) skipped_kpis.push({ kpi_id, reason: "kam_only" });
      else kpi_ids.push(kpi_id);
    }
    const group = groups.find((g) => signals.find((e) => e.id === g.signal_id)!.customer_priority_ids.includes(priority_id));
    return { position: i + 1, priority_id, kpi_ids, skipped_kpis, signal_group_signal_id: group?.signal_id ?? null };
  });
}

/**
 * The first screen: the 9 common tiles as runKpi answers for the period, the Optimisation potential count and top
 * signal group, and up to 3 priority blocks with their answers. The KAM view adds account health and the
 * Customer's industry dashboard_emphasis. With a Site, every answer uses the Site scope and the Site count is 1.
 * With a Site, Optimisation potential counts only the fired results at that Site. The signal groups keep the
 * Customer's ranking, but only the groups with a result at that Site. Throws on an unknown Customer, Site, period
 * or priority, and on a Site of another Customer.
 */
export function firstScreen({ customer_id, site_id, view, period, priorities }: FirstScreenQuery): FirstScreenResult {
  const priority_ids = resolvePriorities(customer_id, priorities);
  const scope = site_id === undefined ? { customer_id } : { customer_id, site_id };
  resolveScope(scope);
  const query: KpiQuery = { scope, period, view };
  const answers = (kpi_ids: string[]) => kpi_ids.map((id) => runKpi(id, query));
  // Keep the groups with a result at the Site, in the Customer's ranking. fired_count below counts only those results.
  const atSite = (r: { site_id: string }) => site_id === undefined || r.site_id === site_id;
  const groups = signalGroups({ customer_id, view, priorities: priority_ids }).filter((g) => g.results.some(atSite));
  const master = getMasterData().data;
  return {
    customer_id,
    view,
    period,
    priority_ids,
    tiles: getViewsAndReview().data.first_screen.common_tiles.map((t) => ({ ...t, answers: answers(t.kpi_ids) })),
    site_count: site_id === undefined ? master.sites.filter((s) => s.customer_id === customer_id).length : 1,
    optimisation_potential: {
      fired_count: groups.reduce((total, g) => total + g.results.filter(atSite).length, 0),
      signal_count: groups.length,
      top_signal_group_signal_id: groups[0]?.signal_id ?? null,
    },
    priority_blocks: priorityBlocks(priority_ids, view, groups).map((b) => ({ ...b, answers: answers(b.kpi_ids) })),
    kam_additions:
      view === "KAM"
        ? {
            account_health: runKpi("account_health", query),
            dashboard_emphasis: dashboardEmphasis(customer_id),
          }
        : null,
  };
}
