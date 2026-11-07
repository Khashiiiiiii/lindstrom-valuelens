// The Data and assumptions page data (#32): the Data transparency items of views-and-review.json for the view, each
// with the rows its refs point at in the other processed files. The Customer view gets the Customer version, and
// the KAM view adds the KAM version's items. Every text here stays English.

import type {
  Assumption,
  Baseline,
  BaselineId,
  BaselineLowCase,
  DataStatusLegendEntry,
  DataTransparencyItem,
  Month,
  PublicFigure,
  ThresholdAndGuard,
  ViewItem,
} from "../data.ts";
import {
  getAccountHealth,
  getFootprintHandprintKpis,
  getMasterData,
  getOperationalCircularityKpis,
  getOpportunitySignals,
  getPeriodComparisons,
  getPublicReference,
  getServiceKpis,
  getViewsAndReview,
} from "../data.ts";
import type { PageRequest } from "./request.ts";

interface ItemHead<Id extends string> {
  id: Id;
  name: string;
  text: string;
}

/** The views an item shows in: "Both" for a Customer version item, "KAM" for a KAM addition. */
export type ItemView = "Both" | "KAM";

interface PageItemHead<Id extends string> extends ItemHead<Id> {
  view: ItemView;
}

/** The washing alternatives every handprint value is compared against, with their factors and mixed waste share. */
export interface BaselineUsedItem extends PageItemHead<"baseline_used"> {
  default_baseline_id: BaselineId;
  baselines: Baseline[];
}

/** The workbook assumptions the item's ref names, in the ref's order. */
export interface AssumptionListItem extends PageItemHead<"assumption_list"> {
  assumptions: Assumption[];
}

/** What each data status label means. */
export interface DataStatusLegendItem extends PageItemHead<"data_status_legend"> {
  entries: DataStatusLegendEntry[];
}

/**
 * What the data does not hold, so no figure is shown for it. The entries keep the item's own wording, never the
 * text their refs point at, which can be KAM view only.
 */
export interface DataGapsItem extends PageItemHead<"data_gaps"> {
  entries: ItemHead<string>[];
}

/** A laundry as its rows name it. */
export interface LaundryHead {
  laundry_id: string;
  laundry_name: string;
  country: string;
}

/** Water and energy per washed kg, by laundry and month, as the workbook rounds them (ADR 0012). */
export interface LaundryWaterAndEnergyFactorsItem extends PageItemHead<"laundry_water_and_energy_factors"> {
  laundries: (LaundryHead & { months: { month: Month; fresh_water_l_per_kg: number; energy_kwh_per_kg: number }[] })[];
}

/** Textile waste per washed kg, fixed per laundry for all 12 months (ADR 0012). */
export interface LaundryWasteFactorsItem extends PageItemHead<"laundry_waste_factors"> {
  laundries: (LaundryHead & { waste_g_per_washed_kg: number })[];
}

/** Process CO2e per kWh, fixed per laundry by its country grid (ADR 0012). */
export interface ProcessCo2ePerKwhItem extends PageItemHead<"process_co2e_per_kwh"> {
  laundries: (LaundryHead & { process_kgco2e_per_kwh: number })[];
}

/**
 * The baseline factors set against public figures, with each baseline's low case. The dataset's laundry actuals
 * are in each figure's applicability text.
 */
export interface PublicFigureComparisonItem extends PageItemHead<"baseline_factors_and_dataset_actuals_against_public_figures"> {
  baselines: Baseline[];
  /** In the order footprint-handprint-kpis.json lists their ids. */
  figures: PublicFigure[];
  low_cases: BaselineLowCase[];
}

/** The KAM notes under the group emissions intensity context line, with the line they explain. */
export interface GroupEmissionsIntensityNotesItem extends PageItemHead<"group_emissions_intensity_notes"> {
  context_line: string;
  notes: { text: string }[];
}

/** The service KPI notes the item's ref names. */
export interface January2026CyclesItem extends PageItemHead<"january_2026_cycles"> {
  notes: { text: string }[];
}

/** The processed files whose catalogue entries carry thresholds. */
export type ThresholdFile = "account-health" | "period-comparisons" | "opportunity-signals";

/** One threshold or guard value, by its parameter name, for example "minimum_sampled_cycles". */
export interface ThresholdParameter {
  parameter: string;
  value: number;
}

/** A catalogue entry with TEAM_ASSUMPTION thresholds: its rule in words, its values and why the team set them. */
export interface ThresholdEntry {
  file: ThresholdFile;
  catalogue_id: string;
  name: string;
  definition: string;
  /** The thresholds first, then the guards. Empty for account health, which is the worst of its inputs. */
  parameters: ThresholdParameter[];
  rationale: string;
  data_status: "TEAM_ASSUMPTION";
}

/** Every threshold and guard, in the item's order. */
export interface ThresholdsAndGuardsItem extends PageItemHead<"thresholds_and_guards"> {
  entries: ThresholdEntry[];
}

/** One Data transparency item: its name, its English text and its rows. */
export type DataPageItem =
  | BaselineUsedItem
  | AssumptionListItem
  | DataStatusLegendItem
  | DataGapsItem
  | LaundryWaterAndEnergyFactorsItem
  | LaundryWasteFactorsItem
  | ProcessCo2ePerKwhItem
  | PublicFigureComparisonItem
  | GroupEmissionsIntensityNotesItem
  | January2026CyclesItem
  | ThresholdsAndGuardsItem;

export interface DataPage {
  /** The items of the view's Data transparency version, in its order. */
  items: DataPageItem[];
}

/** The Data and assumptions page for the request's view. It is the same for every Customer, Site and period. */
export function dataPage({ view }: PageRequest): DataPage {
  const { customer, kam } = getViewsAndReview().data.views.data_transparency;
  const both = new Set(customer.items.map((i) => i.id));
  const items = (view === "KAM" ? kam : customer).items;
  return { items: items.map((item) => resolveItem(item, both.has(item.id) ? "Both" : "KAM")) };
}

/** The item with the rows its refs point at. Throws on an item id the page does not know. */
function resolveItem(item: DataTransparencyItem, view: ItemView): DataPageItem {
  const head = { id: item.id, name: item.name, text: item.text, view };
  switch (item.id) {
    case "baseline_used": {
      const { default_baseline_id } = getFootprintHandprintKpis().data.baselines;
      const ids = refIds(item, "master-data");
      return { ...head, id: item.id, default_baseline_id, baselines: ids.map(masterBaseline) };
    }
    case "assumption_list": {
      const { assumptions } = getMasterData().data;
      const ids = refIds(item, "master-data");
      return { ...head, id: item.id, assumptions: ids.map((id) => assumptions.find((a) => a.assumption_id === id)!) };
    }
    case "data_status_legend":
      return { ...head, id: item.id, entries: item.entries as DataStatusLegendEntry[] };
    case "data_gaps":
      return { ...head, id: item.id, entries: (item.entries as ViewItem[]).map((e) => ({ id: e.id, name: e.name, text: e.text })) };
    case "laundry_water_and_energy_factors": {
      const rows = getFootprintHandprintKpis().data.transparency.laundry_month_factors;
      const laundries = laundryHeads().map((l) => ({
        ...l,
        months: rows
          .filter((r) => r.laundry_id === l.laundry_id)
          .map((r) => ({ month: r.month, fresh_water_l_per_kg: r.fresh_water_l_per_kg, energy_kwh_per_kg: r.energy_kwh_per_kg })),
      }));
      return { ...head, id: item.id, laundries };
    }
    case "laundry_waste_factors": {
      const rows = getOperationalCircularityKpis().data.laundry_waste_factors;
      return { ...head, id: item.id, laundries: perLaundry(rows) };
    }
    case "process_co2e_per_kwh": {
      const rows = getFootprintHandprintKpis().data.transparency.laundry_process_co2e_per_kwh;
      return { ...head, id: item.id, laundries: perLaundry(rows) };
    }
    case "baseline_factors_and_dataset_actuals_against_public_figures": {
      const { baselines, transparency } = getFootprintHandprintKpis().data;
      const figures = getPublicReference().data.figures;
      return {
        ...head,
        id: item.id,
        baselines: baselines.factors.map((f) => masterBaseline(f.baseline_id)),
        figures: transparency.public_figure_ids.map((id) => figures.find((f) => f.id === id)!),
        low_cases: baselines.low_cases,
      };
    }
    case "group_emissions_intensity_notes": {
      const line = getPublicReference().data.context_lines.group_emissions_intensity;
      return { ...head, id: item.id, context_line: line.text, notes: line.kam_notes.map((n) => ({ text: n.text })) };
    }
    case "january_2026_cycles": {
      const notes = getServiceKpis().data.data_transparency_notes;
      const ids = refIds(item, "service-kpis");
      return { ...head, id: item.id, notes: ids.map((id) => ({ text: notes.find((n) => n.id === id)!.text })) };
    }
    case "thresholds_and_guards":
      return { ...head, id: item.id, entries: (item.entries as ThresholdAndGuard[]).map(thresholdEntry) };
    default:
      throw new Error(`The Data transparency item ${item.id} has no rows set for the page.`);
  }
}

/** The catalogue entry a threshold names, with its values. Throws on a file with no thresholds. */
function thresholdEntry({ file, catalogue_id, rationale }: ThresholdAndGuard): ThresholdEntry {
  const asParameters = (pairs: [string, number][]) => pairs.map(([parameter, value]) => ({ parameter, value }));
  const found = <E extends { id: string }>(catalogue: E[]): E => {
    const entry = catalogue.find((c) => c.id === catalogue_id);
    if (!entry) throw new Error(`${file} has no catalogue entry ${catalogue_id}.`);
    return entry;
  };
  const entryHead = (entry: { name: string; definition: string; threshold_data_status: "TEAM_ASSUMPTION" }) => ({
    file,
    catalogue_id,
    name: entry.name,
    definition: entry.definition,
    rationale,
    data_status: entry.threshold_data_status,
  });
  switch (file) {
    case "account-health": {
      const entry = found(getAccountHealth().catalogue);
      const thresholds = entry.thresholds;
      const parameters = thresholds
        ? asParameters([
            ["green_threshold", thresholds.green_threshold],
            ["amber_threshold", thresholds.amber_threshold],
            ["minimum_volume", thresholds.minimum_volume],
          ])
        : [];
      return { ...entryHead(entry), file, parameters };
    }
    case "period-comparisons": {
      const { catalogue, data } = getPeriodComparisons();
      const entry = found(catalogue);
      const test: [string, number] =
        entry.judged_by === "count_test"
          ? ["test_level", data.defaults.test_level]
          : ["scan_coverage_threshold_points", data.defaults.scan_coverage_threshold_points];
      return { ...entryHead(entry), file, parameters: asParameters([test, [entry.minimum_volume_parameter, entry.minimum_volume]]) };
    }
    case "opportunity-signals": {
      const { catalogue, data } = getOpportunitySignals();
      const entry = found(catalogue);
      const guards = Object.entries(entry.thresholds).filter(([parameter]) => parameter !== "threshold");
      const parameters = asParameters([["threshold", entry.thresholds.threshold], ...guards, ["minimum_peers", data.defaults.minimum_peers]]);
      return { ...entryHead(entry), file, parameters };
    }
    default:
      throw new Error(`${file} holds no thresholds.`);
  }
}

/** Every laundry, in master data order. */
function laundryHeads(): LaundryHead[] {
  return getMasterData().data.laundries.map((l) => ({ laundry_id: l.laundry_id, laundry_name: l.laundry_name, country: l.country }));
}

/** Each laundry's one row, in master data order, with the laundry's name and country. Throws on a missing row. */
function perLaundry<R extends { laundry_id: string }>(rows: R[]): (LaundryHead & Omit<R, "laundry_id">)[] {
  return laundryHeads().map((head) => {
    const row = rows.find((r) => r.laundry_id === head.laundry_id);
    if (!row) throw new Error(`No row for laundry ${head.laundry_id}.`);
    return { ...row, ...head };
  });
}

/** The Baselines sheet row of the baseline. Throws on an unknown baseline. */
function masterBaseline(baseline_id: string): Baseline {
  const baseline = getMasterData().data.baselines.find((b) => b.baseline_id === baseline_id);
  if (!baseline) throw new Error(`Unknown baseline ${baseline_id}.`);
  return baseline;
}

/** The ids the item's ref into the file names. Throws when the item has no such ref. */
function refIds(item: DataTransparencyItem, file: string): string[] {
  const ref = item.refs.find((r) => r.file === file && "ids" in r);
  if (!ref || !("ids" in ref)) throw new Error(`${item.id} has no ref with ids into ${file}.`);
  return ref.ids;
}
