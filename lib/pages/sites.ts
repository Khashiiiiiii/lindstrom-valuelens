// The Sites page data (#30): one row per Site of the Customer, for the bar chart and the Site table. The columns
// are the priority blocks' KPIs, and every cell is a runKpi answer at Site scope (ADR 0001). The bar lengths are
// worked out here, on the server, so the client computes nothing from a figure.

import type { KpiAnswer, SignalId } from "../data.ts";
import { firstScreen, getMasterData, getPeriodComparisons, runKpi, signalGroups } from "../data.ts";
import type { PageRequest } from "./request.ts";

/** A fired signal result at one Site, with its gap to the Customer's other Sites. */
export interface SiteSignal {
  signal_id: SignalId;
  /** null for a Site-grain signal. */
  product_id: string | null;
  gap: number;
}

/** One Site of the Customer. */
export interface SiteRow {
  site_id: string;
  site_name: string;
  site_type: string;
  /** One answer per column, in kpi_ids order, at the Site's scope for the request period and view. */
  answers: KpiAnswer[];
  /**
   * One bar length per column, from 0 to 1: the cell's value over the largest value in its column. null for a cell
   * with no number to draw: Withheld, not evaluated, or a period comparison, whose figure is a label.
   */
  bar_fractions: (number | null)[];
  /**
   * The Site's fired signal results in the view, in the signal group ranking for the priorities, then by gap. They
   * judge all of 2025, whatever the period.
   */
  fired: SiteSignal[];
}

export interface SitesPage {
  /**
   * The table columns: the KPIs of the priority blocks, in block order, each once. A block leaves out the KPIs on
   * the common row and, in the Customer view, the KAM-only KPIs, as firstScreen sets. The Customer view also
   * leaves out the period comparisons, because runKpi withholds them at Site grain (ADR 0011).
   */
  kpi_ids: string[];
  /** Every Site of the Customer, in master data order. */
  rows: SiteRow[];
}

/**
 * The Sites page for the request's Customer, period, view and priorities. The rows cover every Site whatever the
 * Site filter, so the KAM can compare them.
 */
export function sitesPage({ customer_id, period, view, priorities }: PageRequest): SitesPage {
  const blocks = firstScreen({ customer_id, period, view, priorities }).priority_blocks;
  const comparisons = new Set(getPeriodComparisons().catalogue.map((c) => c.id));
  const kpi_ids = [...new Set(blocks.flatMap((b) => b.kpi_ids))].filter((id) => view === "KAM" || !comparisons.has(id));
  const groups = signalGroups({ customer_id, view, priorities });
  const sites = getMasterData().data.sites.filter((s) => s.customer_id === customer_id);
  const answers = sites.map((s) => kpi_ids.map((kpi_id) => runKpi(kpi_id, { scope: { customer_id, site_id: s.site_id }, period, view })));
  const drawn = answers.map((row) => row.map((a, i) => (comparisons.has(kpi_ids[i]) ? null : barValue(a))));
  const largest = kpi_ids.map((_, i) => Math.max(0, ...drawn.map((row) => row[i] ?? 0)));
  return {
    kpi_ids,
    rows: sites.map((s, j) => ({
      site_id: s.site_id,
      site_name: s.site_name,
      site_type: s.site_type,
      answers: answers[j],
      bar_fractions: drawn[j].map((v, i) => (v === null || largest[i] === 0 ? null : Math.max(v, 0) / largest[i])),
      fired: groups.flatMap((g) =>
        g.results.filter((r) => r.site_id === s.site_id).map((r) => ({ signal_id: g.signal_id, product_id: r.product_id, gap: r.gap })),
      ),
    })),
  };
}

/** The answer's value, or null when it is Withheld or not evaluated. */
function barValue(answer: KpiAnswer): number | null {
  return "withheld" in answer ? null : answer.value;
}
