// The Overview's KAM additions as display text in the app language (#28): the account health strip, the industry's
// dashboard_emphasis, the textile waste route donut and turnaround by stage. Account health is KAM view only (ADR
// 0009), and #28 puts the other 3 in the KAM view too. The figures are the page data's runKpi answers, and this
// module only formats and translates them. Rating reasons, emphasis texts and caveats are data text and stay
// English.

import type { HealthRating, KpiAnswer, KpiResult } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber, monthName, t } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { KamCharts, OverviewPage } from "../../lib/pages/overview.ts";

export interface HealthStrip {
  /** The rating label, or null when the period is not rated. */
  rating: string | null;
  tone: HealthRating | null;
  /** The rating's reason, or why there is no rating. */
  reason: string;
  based_on: string | null;
  inputs: { name: string; value: string; rating: string; tone: HealthRating }[];
}

export interface EmphasisCard {
  title: string;
  industry: string;
  texts: { term: string; text: string }[];
}

export interface WasteDonut {
  name: string;
  /** The KPI value: the sum of the routes as runKpi gives it. */
  total: string;
  unit: string;
  data_status: string;
  /** fraction is the arc length from the page data. It is never shown as a figure (ADR 0001). */
  segments: { key: string; label: string; kg: string; fraction: number }[];
  caveats: string[];
}

export interface StageBars {
  name: string;
  /** The stage names, in stacking order. */
  legend: string[];
  /**
   * One bar per data month. hours follows the legend order, and is empty for a month not evaluated. titles holds
   * each stage's point title, such as "Jan: In the laundry 41 hours".
   */
  bars: { month: string; in_period: boolean; hours: number[]; titles: string[] }[];
  caveats: string[];
}

export interface KamCards {
  health: HealthStrip;
  emphasis: EmphasisCard | null;
  /** null when the route split is Withheld or not evaluated. */
  waste: WasteDonut | null;
  /** null when the first month is Withheld. */
  stages: StageBars | null;
}

/** The KAM additions, or null in the Customer view. */
export function kamCards(lang: Lang, page: OverviewPage, meta: Metadata): KamCards | null {
  if (page.kam_additions === null || page.kam_charts === null) return null;
  const { account_health, dashboard_emphasis } = page.kam_additions;
  const { textile_waste_by_treatment_route: waste, turnaround_by_stage: months } = page.kam_charts;
  return {
    health: healthStrip(lang, account_health, meta),
    emphasis: dashboard_emphasis && {
      title: t(lang, "Dashboard emphasis (illustrative)"),
      industry: dataLabel(lang, dashboard_emphasis.industry),
      texts: dashboard_emphasis.texts.map(({ term, text }) => ({ term, text })),
    },
    waste: "withheld" in waste ? null : wasteDonut(lang, waste, page.kam_charts.textile_waste_route_arcs),
    stages: stageBars(lang, months),
  };
}

function healthStrip(lang: Lang, answer: KpiAnswer, meta: Metadata): HealthStrip {
  const detail = "withheld" in answer ? null : answer.detail;
  if (detail?.kind !== "account_health") {
    return {
      rating: null,
      tone: null,
      reason: "withheld" in answer ? t(lang, "KAM view only") : (answer.not_evaluated_reason ?? ""),
      based_on: null,
      inputs: [],
    };
  }
  const { rating } = detail;
  return {
    rating: dataLabel(lang, rating.rating),
    tone: rating.rating,
    reason: rating.reason,
    based_on: rating.based_on,
    inputs: rating.inputs.map((input) => ({
      name: dataLabel(lang, meta.kpis.find((k) => k.id === input.input_id)?.name ?? input.input_id),
      value: input.value === null ? dataLabel(lang, "not_evaluated") : inputValue(lang, input.input_id, input.value),
      rating: dataLabel(lang, input.rating),
      tone: input.rating,
    })),
  };
}

/** Shares as percentages. Service requests per 100 wearers per month is a number. */
function inputValue(lang: Lang, input_id: string, value: number): string {
  if (input_id === "account_health_service_requests_per_100_wearers_per_month") {
    return formatNumber(lang, value, { maximumFractionDigits: 2 });
  }
  return formatNumber(lang, value, { style: "percent", maximumFractionDigits: 1 });
}

/** The donut, or null when the route split is not evaluated. */
function wasteDonut(lang: Lang, result: KpiResult, arcs: KamCharts["textile_waste_route_arcs"]): WasteDonut | null {
  const { value, breakdown } = result;
  if (value === null || breakdown === null) return null;
  const kg = (v: number) => formatNumber(lang, v, { maximumFractionDigits: 0 });
  return {
    name: dataLabel(lang, result.name),
    total: kg(value),
    unit: dataLabel(lang, result.unit, value),
    data_status: dataLabel(lang, result.data_status),
    segments: breakdown.map((b) => ({
      key: b.key,
      label: dataLabel(lang, b.key),
      kg: kg(b.value),
      fraction: arcs.find((a) => a.key === b.key)?.fraction ?? 0,
    })),
    caveats: [...result.caveats],
  };
}

/** The bars, or null when the first month is Withheld. */
function stageBars(lang: Lang, months: KamCharts["turnaround_by_stage"]): StageBars | null {
  const results = months.map((m) => ("withheld" in m.answer ? null : m.answer));
  const first = results[0];
  if (!first) return null;
  const keys = (results.find((r) => r?.breakdown)?.breakdown ?? []).map((b) => b.key);
  const legend = keys.map((k) => dataLabel(lang, k));
  return {
    name: dataLabel(lang, first.name),
    legend,
    bars: months.map((m, i) => {
      const breakdown = results[i]?.value === null ? null : results[i]?.breakdown;
      const month = monthName(lang, m.month, "short");
      const hours = breakdown ? keys.map((k) => breakdown.find((b) => b.key === k)?.value ?? 0) : [];
      return {
        month,
        in_period: m.in_period,
        hours,
        titles: hours.map((h, k) => `${month}: ${legend[k]} ${formatNumber(lang, h)} ${dataLabel(lang, "hours", h)}`),
      };
    }),
    caveats: [...first.caveats],
  };
}
