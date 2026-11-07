// The Sites page as display text in the app language (#30): the Site table and the bar chart options. The figures
// are the page data's runKpi answers and stored signal gaps. This module only formats, translates and sorts them.

import type { KpiAnswer, KpiResult } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { SitesPage } from "../../lib/pages/sites.ts";
import { formatValue } from "../overview/tile-cards.ts";

export interface SiteColumn {
  kpi_id: string;
  name: string;
  /** The unit under the column name. Empty for a share or a period comparison, whose cells carry their own text. */
  unit: string;
}

export interface SiteTableRow {
  site_id: string;
  name: string;
  site_type: string;
  /** One text per column. */
  cells: string[];
  /** The Site's fired signals, each with its gap to the Customer's other Sites as a signed percentage. */
  fired: { key: string; name: string; gap: string }[];
}

export interface SiteBar {
  site_id: string;
  name: string;
  /** The bar length from the page data, from 0 to 1. null for a Site with no number, which has no bar. */
  fraction: number | null;
  text: string;
}

/** A KPI the bar chart can show, with one bar per Site, largest first, then the Sites not evaluated. */
export interface SiteChart {
  kpi_id: string;
  name: string;
  bars: SiteBar[];
}

export interface SiteTable {
  columns: SiteColumn[];
  rows: SiteTableRow[];
  /** The columns with a bar at one Site or more. A period comparison is a label, so it has no bar. */
  charts: SiteChart[];
}

/** The Site table and the bar chart options for the page data. */
export function siteTable(lang: Lang, page: SitesPage, meta: Metadata): SiteTable {
  const results = (i: number) => page.rows.map((r) => r.answers[i]).filter((a): a is KpiResult => !("withheld" in a));
  const columns = page.kpi_ids.map((kpi_id, i): SiteColumn => {
    const first = results(i)[0];
    const name = meta.kpis.find((k) => k.id === kpi_id)?.name ?? first?.name ?? kpi_id;
    const unit = first && first.detail?.kind !== "period_comparison" && first.unit !== "share" ? dataLabel(lang, first.unit) : "";
    return { kpi_id, name: dataLabel(lang, name), unit };
  });
  const rows = page.rows.map((row) => ({
    site_id: row.site_id,
    name: row.site_name,
    site_type: dataLabel(lang, row.site_type),
    cells: row.answers.map((a) => cellText(lang, a)),
    fired: row.fired.map((f) => ({
      key: `${f.signal_id} ${f.product_id ?? ""}`,
      name: dataLabel(lang, meta.signals.find((s) => s.id === f.signal_id)?.name ?? f.signal_id),
      gap: formatNumber(lang, f.gap, { style: "percent", maximumFractionDigits: 0, signDisplay: "always" }),
    })),
  }));
  const charts = columns.flatMap((column, i): SiteChart[] => {
    if (page.rows.every((row) => row.bar_fractions[i] === null)) return [];
    const bars = page.rows.map((row): SiteBar => ({
      site_id: row.site_id,
      name: row.site_name,
      fraction: row.bar_fractions[i],
      text: cellText(lang, row.answers[i]),
    }));
    // Longest bar first, then the Sites with no bar.
    bars.sort((a, b) => (b.fraction ?? -1) - (a.fraction ?? -1));
    return [{ kpi_id: column.kpi_id, name: column.name, bars }];
  });
  return { columns, rows, charts };
}

/** A cell as text: a period comparison's label, else the value as the tiles show it, without the unit. */
function cellText(lang: Lang, answer: KpiAnswer): string {
  if ("withheld" in answer) return "";
  if (answer.detail?.kind === "period_comparison") return dataLabel(lang, answer.detail.comparison.label);
  return formatValue(lang, answer).value;
}
