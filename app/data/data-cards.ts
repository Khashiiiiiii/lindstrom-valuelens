// The Data and assumptions page as display text in the app language (#32, #38). Each item keeps its page data, and
// every data value the page translates gets a "_text" field beside it: data statuses, selection statuses,
// countries, units, threshold names and parameters. Item names and texts stay English.

import type { Baseline, BaselineLowCase, PublicFigure } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel } from "../../lib/i18n.ts";
import type {
  BaselineUsedItem,
  DataPage,
  DataPageItem,
  DataStatusLegendItem,
  LaundryHead,
  LaundryWasteFactorsItem,
  LaundryWaterAndEnergyFactorsItem,
  ProcessCo2ePerKwhItem,
  PublicFigureComparisonItem,
  ThresholdEntry,
  ThresholdParameter,
  ThresholdsAndGuardsItem,
} from "../../lib/pages/data.ts";

export type BaselineCard = Baseline & { selection_text: string };
export type LaundryCard<L extends LaundryHead = LaundryHead> = L & { country_text: string };
export type FigureCard = PublicFigure & { unit_text: string; data_status_text: string };
export type LowCaseCard = BaselineLowCase & { data_status_text: string };
export type ThresholdCard = Omit<ThresholdEntry, "parameters"> & {
  name_text: string;
  data_status_text: string;
  parameters: (ThresholdParameter & { parameter_text: string })[];
};

type Laundries<I extends { laundries: LaundryHead[] }> = Omit<I, "laundries"> & { laundries: LaundryCard<I["laundries"][number]>[] };

/** One Data transparency item with the display text of its data values. */
export type DataCard =
  | Exclude<DataPageItem, BaselineUsedItem | DataStatusLegendItem | LaundryItem | PublicFigureComparisonItem | ThresholdsAndGuardsItem>
  | (Omit<BaselineUsedItem, "baselines"> & { baselines: BaselineCard[] })
  | (Omit<DataStatusLegendItem, "entries"> & { entries: (DataStatusLegendItem["entries"][number] & { data_status_text: string })[] })
  | Laundries<LaundryWaterAndEnergyFactorsItem>
  | Laundries<LaundryWasteFactorsItem>
  | Laundries<ProcessCo2ePerKwhItem>
  | (Omit<PublicFigureComparisonItem, "baselines" | "figures" | "low_cases"> & {
      baselines: BaselineCard[];
      figures: FigureCard[];
      low_cases: LowCaseCard[];
    })
  | (Omit<ThresholdsAndGuardsItem, "entries"> & { entries: ThresholdCard[] });

type LaundryItem = LaundryWaterAndEnergyFactorsItem | LaundryWasteFactorsItem | ProcessCo2ePerKwhItem;

/** The page's items in order, each with the display text of its data values in the language. */
export function dataCards(lang: Lang, page: DataPage): DataCard[] {
  const baseline = (b: Baseline): BaselineCard => ({ ...b, selection_text: dataLabel(lang, b.selection_status) });
  const laundry = <L extends LaundryHead>(l: L): LaundryCard<L> => ({ ...l, country_text: dataLabel(lang, l.country) });
  return page.items.map((item): DataCard => {
    switch (item.id) {
      case "baseline_used":
        return { ...item, baselines: item.baselines.map(baseline) };
      case "data_status_legend":
        return { ...item, entries: item.entries.map((e) => ({ ...e, data_status_text: dataLabel(lang, e.data_status) })) };
      case "laundry_water_and_energy_factors":
        return { ...item, laundries: item.laundries.map(laundry) };
      case "laundry_waste_factors":
        return { ...item, laundries: item.laundries.map(laundry) };
      case "process_co2e_per_kwh":
        return { ...item, laundries: item.laundries.map(laundry) };
      case "baseline_factors_and_dataset_actuals_against_public_figures":
        return {
          ...item,
          baselines: item.baselines.map(baseline),
          figures: item.figures.map((f) => ({ ...f, unit_text: dataLabel(lang, f.unit), data_status_text: dataLabel(lang, f.data_status) })),
          low_cases: item.low_cases.map((c) => ({ ...c, data_status_text: dataLabel(lang, c.data_status) })),
        };
      case "thresholds_and_guards":
        return {
          ...item,
          entries: item.entries.map((e) => ({
            ...e,
            name_text: dataLabel(lang, e.name),
            data_status_text: dataLabel(lang, e.data_status),
            parameters: e.parameters.map((p) => ({ ...p, parameter_text: dataLabel(lang, p.parameter) })),
          })),
        };
      default:
        return item;
    }
  });
}
