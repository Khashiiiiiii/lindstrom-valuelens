// The PowerPoint deck of the annual review (#36): 12 slides in the 5 review parts, built on the server with
// pptxgenjs. The deck always follows the Customer view, whatever view the request names, so it holds no account
// health and no KAM-only result (ADR 0009, ADR 0011). It uses the request's period, priorities and language, and
// covers the whole Customer, so a Site filter does not narrow it.
//
// Every figure is a runKpi answer or a value from data/processed (ADR 0001). This module only lays them out,
// formats and translates them. Caveats and transparency texts stay English, as the spec sets. The charts are
// tables for now. Native charts come in #37.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import pptxgen from "pptxgenjs";

import type { DataStatusLegendEntry, DataTransparencyItem, KpiAnswer, KpiQuery, KpiResult, Period, ViewItem } from "../data.ts";
import {
  firstScreen,
  getCustomerPriorities,
  getMasterData,
  getOpportunitySignals,
  getPublicReference,
  getViewsAndReview,
  proposedNextSteps,
  runKpi,
  signalGroups,
} from "../data.ts";
import { DEMO_KAM } from "../demo-kam.ts";
import type { DictionaryKey, Lang } from "../i18n.ts";
import { AI_TRANSLATION_NOTE, dataLabel, formatNumber, formatValue, monthName, t } from "../i18n.ts";
import type { PageRequest } from "./request.ts";
import { BadRequest, parsePageRequest } from "./request.ts";

/** A page request with the app language. The deck ignores its view and Site. */
export interface DeckRequest extends PageRequest {
  lang: Lang;
}

const LANGS: readonly Lang[] = ["en", "sv", "fi"];

/** The deck request in a route body. Throws BadRequest as parsePageRequest does, and on an unknown language. */
export function parseDeckRequest(body: unknown): DeckRequest {
  const request = parsePageRequest(body);
  const { lang } = body as Record<string, unknown>;
  if (!LANGS.includes(lang as Lang)) throw new BadRequest('lang must be "en", "sv" or "fi".');
  return { ...request, lang: lang as Lang };
}

/** The file name the browser saves the deck as, for example "ValueLens, NorthStar Foods Group, H2 2025 (SV).pptx". */
export function deckFileName({ customer_id, period, lang }: DeckRequest): string {
  return `ValueLens, ${customerName(customer_id)}, ${periodName(lang, period)} (${lang.toUpperCase()}).pptx`;
}

/** The 3 period comparisons of the Improvement area, at Customer grain (ADR 0010). */
const COMPARISON_IDS = ["improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage"];

// Lindström navy and red, read from the logo file (public/SOURCE.md). The rest are tints of the navy.
const NAVY = "003F72";
const RED = "E00034";
const INK = "1B2430";
const MUTED = "5B6B7F";
const TINT = "EEF3F8";
const LINE = "DCE4EE";
const PALE = "A9C8E6";
const WHITE = "FFFFFF";
const FONT = "Arial";
const LOGO_RATIO = 2117 / 429;

type Slide = pptxgen.Slide;
type Box = { x: number; y: number; w: number; h: number };
/** A figure as display text, for a figure card. */
type Figure = { label: string; value: string; unit: string };

/** The deck for the request's Customer, period, priorities and language, in the Customer view, as a .pptx file. */
export async function deckFile(request: DeckRequest): Promise<Uint8Array<ArrayBuffer>> {
  const { lang, customer_id, period } = request;
  const view = "Customer";
  const master = getMasterData().data;
  const customer = customerName(customer_id);
  const query: KpiQuery = { scope: { customer_id }, period, view };
  const kpi = (id: string): KpiResult | null => shown(runKpi(id, query));
  /** The results of the KPIs the Customer view shows, in order. */
  const kpis = (ids: string[]): KpiResult[] => ids.map(kpi).filter((r): r is KpiResult => r !== null);
  const screen = firstScreen({ customer_id, view, period, priorities: request.priorities });
  const priorities = screen.priority_ids;
  const groups = signalGroups({ customer_id, view, priorities });
  const steps = proposedNextSteps({ customer_id, view, priorities });
  const priorityName = (id: string) => dataLabel(lang, getCustomerPriorities().catalogue.find((p) => p.id === id)?.name ?? id);
  const signalName = (id: string) => dataLabel(lang, getOpportunitySignals().catalogue.find((s) => s.id === id)?.name ?? id);
  const siteName = (id: string) => master.sites.find((s) => s.site_id === id)?.site_name ?? id;
  const periodText = periodName(lang, period);
  const monthly = (id: string) => master.months.map((month) => shown(runKpi(id, { ...query, period: month })));

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
  pres.author = DEMO_KAM.name;
  pres.company = "Lindström";
  pres.title = `${t(lang, "Annual value review")}, ${customer}, ${periodText}`;
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  const footer = `${t(lang, "ValueLens by Lindström")}   |   ${customer}   |   ${periodText}`;
  const deck = new Deck(pres, footer);

  // 1. Title
  let s = deck.dark(t(lang, "Annual value review"));
  text(s, t(lang, "Annual value review"), { x: 0.6, y: 2.3, w: 8.4, h: 0.9 }, { fontSize: 44, bold: true, color: WHITE });
  text(s, customer, { x: 0.6, y: 3.25, w: 8.4, h: 0.7 }, { fontSize: 28, color: PALE });
  text(s, periodText, { x: 0.6, y: 3.95, w: 8.4, h: 0.5 }, { fontSize: 20, color: WHITE });
  const credits = [t(lang, "Prepared by {name}, Lindström", { name: DEMO_KAM.name }), t(lang, "Customer view. Synthetic data.")];
  if (lang !== "en") credits.push(t(lang, AI_TRANSLATION_NOTE));
  text(s, credits.join("\n"), { x: 0.6, y: 5.1, w: 8.4, h: 1.1 }, { fontSize: 14, color: PALE });

  // 2. Agenda: the 5 review parts and the Customer priorities
  s = deck.content(t(lang, "Agenda"), t(lang, "Agenda"), t(lang, "Annual value review"));
  const agenda: [DictionaryKey, DictionaryKey][] = [
    ["Look back", "Service performance and adoption"],
    ["Show value", "Operational and sustainability value"],
    ["Build trust", "How we read the data"],
    ["Look forward", "Where to improve next"],
    ["Agree actions", "Up to 3 proposed next steps"],
  ];
  agenda.forEach(([part, about], i) => {
    const y = 1.85 + i * 0.95;
    dot(s, i + 1, { x: 0.6, y, w: 0.5, h: 0.5 }, NAVY);
    text(s, t(lang, part), { x: 1.3, y: y - 0.04, w: 6, h: 0.34 }, { fontSize: 18, bold: true, color: INK });
    text(s, t(lang, about), { x: 1.3, y: y + 0.3, w: 6, h: 0.3 }, { fontSize: 13, color: MUTED });
  });
  card(s, { x: 8.1, y: 1.85, w: 4.65, h: 4.6 });
  text(s, t(lang, "Your priorities"), { x: 8.45, y: 2.05, w: 4, h: 0.4 }, { fontSize: 18, bold: true, color: NAVY });
  const rowGap = Math.min(0.75, 3.6 / Math.max(priorities.length, 1));
  priorities.forEach((id, i) => {
    const y = 2.65 + i * rowGap;
    dot(s, i + 1, { x: 8.45, y, w: 0.4, h: 0.4 }, i < screen.priority_blocks.length ? RED : MUTED);
    text(s, priorityName(id), { x: 9.05, y, w: 3.5, h: 0.4 }, { fontSize: 15, color: INK, valign: "middle" });
  });
  if (priorities.length > 0) {
    text(s, t(lang, "The first 3 make the priority blocks."), { x: 8.45, y: 6.0, w: 4.1, h: 0.3 }, { fontSize: 11, color: MUTED });
  }

  // 3. Look back: the year at a glance
  s = deck.content(t(lang, "Look back"), t(lang, "The year at a glance"));
  const glance: Figure[] = [
    { label: t(lang, "Site count"), value: formatNumber(lang, screen.site_count), unit: t(lang, "Sites_unit", { n: screen.site_count }) },
  ];
  for (const r of kpis(["active_wearers", "garments_in_circulation", "washed_kg"])) glance.push({ label: dataLabel(lang, r.name), ...formatValue(lang, r) });
  glance.forEach((g, i) => stat(s, g, { x: 0.6 + i * 3.1, y: 1.75, w: 2.85, h: 1.6 }));
  monthTable(s, lang, t(lang, "Washed kg per month"), master.months, monthly("washed_kg"), 3.75);
  caption(s, t(lang, "Full year 2025, by month."), { x: 0.6, y: 6.3, w: 12.15, h: 0.3 });

  // 4. Look back: service performance
  s = deck.content(t(lang, "Look back"), t(lang, "Service performance"));
  kpis(["on_time_service_cycle_share", "turnaround_hours_median", "service_requests_per_100_wearers"]).forEach((r, i) => stat(s, { label: dataLabel(lang, r.name), ...formatValue(lang, r) }, { x: 0.6 + i * 4.1, y: 1.75, w: 3.85, h: 1.6 }));
  monthTable(s, lang, t(lang, "On-time service cycle share per month"), master.months, monthly("on_time_service_cycle_share"), 3.75);
  caption(s, t(lang, "Full year 2025, by month."), { x: 0.6, y: 6.3, w: 12.15, h: 0.3 });

  // 5. Show value: sustainability, with the baseline caveat and the deferred Financial Value note
  s = deck.content(t(lang, "Show value"), t(lang, "Sustainability value"));
  kpis(["emissions_saved", "water_saved", "energy_saved"]).forEach((r, i) => {
    const baseline = r.detail?.kind === "handprint" ? `, ${dataLabel(lang, r.detail.baseline_label)}` : "";
    stat(s, { label: `${dataLabel(lang, r.name)}${baseline}`, ...formatValue(lang, r) }, { x: 0.6 + i * 4.1, y: 1.75, w: 3.85, h: 1.6 });
  });
  monthTable(s, lang, t(lang, "Emissions saved per month, kg CO2e"), master.months, monthly("emissions_saved"), 3.75);
  const tileCaveats = getViewsAndReview().data.first_screen.common_tiles.flatMap((tile) => tile.caveats ?? []);
  const context = getPublicReference().data.context_lines.group_emissions_intensity;
  const notes = [
    ...new Set(tileCaveats.map((c) => c.caveat)),
    `${dataLabel(lang, context.data_status)}: ${context.text}`,
    dataGap("cost"),
  ];
  caption(s, notes.join("\n"), { x: 0.6, y: 5.75, w: 12.15, h: 0.95 });

  // 6. Show value: circularity and the waste routes
  s = deck.content(t(lang, "Show value"), t(lang, "Circularity and textile waste"));
  const waste = kpi("textile_waste_by_treatment_route");
  if (waste?.breakdown) {
    text(s, dataLabel(lang, waste.name), { x: 0.6, y: 1.75, w: 6.2, h: 0.4 }, { fontSize: 14, bold: true, color: INK });
    const rows: pptxgen.TableRow[] = waste.breakdown.map((b) => [
      cell(dataLabel(lang, b.key)),
      cell(`${formatNumber(lang, b.value, { maximumFractionDigits: 0 })} ${dataLabel(lang, waste.unit, b.value)}`, { align: "right" }),
    ]);
    rows.push([
      cell(dataLabel(lang, "total"), { bold: true }),
      cell(`${formatValue(lang, waste).value} ${formatValue(lang, waste).unit}`, { align: "right", bold: true }),
    ]);
    table(s, rows, { x: 0.6, y: 2.25, w: 6.2, h: 0 }, [3.7, 2.5]);
  }
  kpis(["repairs", "repair_rate", "recycled_or_reused_share", "avoided_product_co2e_estimated"]).forEach((r, i) =>
      stat(s, { label: dataLabel(lang, r.name), ...formatValue(lang, r) }, {
        x: 7.2 + (i % 2) * 2.85,
        y: 1.75 + Math.floor(i / 2) * 2.3,
        w: 2.7,
        h: 2.1,
      }),
    );

  // 7. Show value: the priority blocks
  s = deck.content(t(lang, "Show value"), t(lang, "Your priorities"));
  if (screen.priority_blocks.length === 0) {
    text(s, t(lang, "No priorities chosen. The Overview shows no priority blocks."), { x: 0.6, y: 1.9, w: 12, h: 0.5 }, { fontSize: 16, color: MUTED });
  }
  screen.priority_blocks.forEach((block, i) => {
    const x = 0.6 + i * 4.1;
    card(s, { x, y: 1.75, w: 3.85, h: 4.85 });
    dot(s, block.position, { x: x + 0.25, y: 2.0, w: 0.42, h: 0.42 }, RED);
    text(s, priorityName(block.priority_id), { x: x + 0.8, y: 2.0, w: 2.85, h: 0.42 }, { fontSize: 18, bold: true, color: NAVY, valign: "middle" });
    const results = block.answers.map(shown).filter((r): r is KpiResult => r !== null);
    results.slice(0, 3).forEach((r, k) => {
      const { value, unit } = formatValue(lang, r);
      const y = 2.65 + k * 1.05;
      s.addText(
        [
          { text: value, options: { fontSize: 22, bold: true, color: INK } },
          { text: unit ? ` ${unit}` : "", options: { fontSize: 11, color: MUTED } },
        ],
        { x: x + 0.25, y, w: 3.35, h: 0.45, fontFace: FONT, margin: 0, valign: "bottom" },
      );
      text(s, dataLabel(lang, r.name), { x: x + 0.25, y: y + 0.47, w: 3.35, h: 0.5 }, { fontSize: 11, color: MUTED });
    });
    const group = groups.find((g) => g.signal_id === block.signal_group_signal_id);
    const signal = group ? signalName(group.signal_id) : t(lang, "No fired signal for this priority.");
    text(s, signal, { x: x + 0.25, y: 5.85, w: 3.35, h: 0.6 }, { fontSize: 11, bold: group !== undefined, color: group ? RED : MUTED });
  });

  // 8. Build trust: how we read the data, the Customer version of Data transparency (ADR 0011)
  s = deck.content(t(lang, "Build trust"), t(lang, "How we read the data"));
  // 3 columns: the baseline and the assumption list, the data gaps, and the data status legend.
  const baselineUsed = transparencyItem("baseline_used");
  heading(s, baselineUsed.name, { x: 0.6, y: 1.75, w: 3.85, h: 0.3 });
  text(s, baselineUsed.text, { x: 0.6, y: 2.1, w: 3.85, h: 1.0 }, { fontSize: 11, color: INK });
  heading(s, transparencyItem("assumption_list").name, { x: 0.6, y: 3.2, w: 3.85, h: 0.3 });
  const assumptionIds = new Set(["A001", "A002", "A003", "A004", "A005"]);
  table(
    s,
    getMasterData()
      .data.assumptions.filter((a) => assumptionIds.has(a.assumption_id))
      .map((a) => [cell(`${a.assumption_id} ${a.assumption}`, { bold: true }), cell(a.value_or_rule)]),
    { x: 0.6, y: 3.55, w: 3.85, h: 0 },
    [1.55, 2.3],
    9,
  );
  const gaps = transparencyItem("data_gaps");
  heading(s, gaps.name, { x: 4.7, y: 1.75, w: 3.85, h: 0.3 });
  table(
    s,
    (gaps.entries as ViewItem[]).map((g) => [cell(g.name, { bold: true }), cell(g.text)]),
    { x: 4.7, y: 2.1, w: 3.85, h: 0 },
    [1.3, 2.55],
    9,
  );
  card(s, { x: 8.8, y: 1.75, w: 3.95, h: 4.85 });
  heading(s, t(lang, "Data status"), { x: 9.0, y: 1.9, w: 3.55, h: 0.3 });
  table(
    s,
    (transparencyItem("data_status_legend").entries as DataStatusLegendEntry[]).map((e) => [
      cell(dataLabel(lang, e.data_status), { bold: true, color: NAVY }),
      cell(e.text),
    ]),
    { x: 9.0, y: 2.3, w: 3.55, h: 0 },
    [1.35, 2.2],
    9,
    TINT,
  );

  // 9. Look forward: signal gaps, every fired signal group in rank order. Signals judge all of 2025.
  s = deck.content(t(lang, "Look forward"), t(lang, "Where to improve next"));
  text(s, t(lang, "Largest gap to the Customer's other Sites, by signal"), { x: 0.6, y: 1.75, w: 12.15, h: 0.35 }, {
    fontSize: 14,
    bold: true,
    color: INK,
  });
  if (groups.length === 0) {
    text(s, t(lang, "No fired signals."), { x: 0.6, y: 2.2, w: 12, h: 0.4 }, { fontSize: 14, color: MUTED });
  } else {
    table(
      s,
      groups.map((g) => [
        cell(signalName(g.signal_id), { bold: true }),
        cell(formatNumber(lang, g.largest_gap, { style: "percent", maximumFractionDigits: 0 }), { align: "right", bold: true, color: RED }),
        cell(t(lang, "{n} result(s)", { n: g.fired_count })),
        cell(`${dataLabel(lang, g.lever)} ${t(lang, "Owner: {x}", { x: dataLabel(lang, `${g.lever_owner}_owner`) })}`),
      ]),
      { x: 0.6, y: 2.2, w: 12.15, h: 0 },
      [4.4, 1.0, 1.4, 5.35],
      11,
    );
  }
  caption(s, `${t(lang, "ranked by your priorities, then by gap")}. ${t(lang, "Signals judge all of 2025.")}`, {
    x: 0.6,
    y: 6.3,
    w: 12.15,
    h: 0.3,
  });

  // 10. Look forward: change from H1 to H2, from the 3 period comparisons at Customer grain. H2 against H1 covers
  // all of 2025, so it does not follow the request period. The caption names the 2 halves.
  s = deck.content(t(lang, "Look forward"), t(lang, "Change from H1 to H2"));
  const changes = COMPARISON_IDS.map((id) => shown(runKpi(id, { ...query, period: "2025", compare_to: "h2_vs_h1" }))).filter(
    (r): r is KpiResult => r !== null,
  );
  changes.forEach((r, i) => {
    const x = 0.6 + i * 4.1;
    const comparison = r.detail?.kind === "period_comparison" ? r.detail.comparison : null;
    card(s, { x, y: 1.75, w: 3.85, h: 4.4 });
    text(s, dataLabel(lang, r.name), { x: x + 0.3, y: 2.0, w: 3.25, h: 0.75 }, { fontSize: 16, bold: true, color: NAVY });
    if (comparison) {
      [comparison.comparison_period, comparison.period].forEach((side, k) => {
        const { value, unit } = formatValue(lang, { ...r, value: side.value });
        text(s, side.name, { x: x + 0.3, y: 2.95 + k * 1.0, w: 1.1, h: 0.6 }, { fontSize: 13, color: MUTED, valign: "middle" });
        text(s, value, { x: x + 1.4, y: 2.95 + k * 1.0, w: 2.15, h: 0.6 }, { fontSize: 26, bold: true, color: k ? NAVY : MUTED, valign: "middle" });
        if (unit) text(s, unit, { x: x + 1.4, y: 3.5 + k * 1.0, w: 2.15, h: 0.3 }, { fontSize: 10, color: MUTED });
      });
    }
    const label = comparison?.label ?? "not_evaluated";
    const tone = label === "better" ? NAVY : label === "worse" ? RED : MUTED;
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.3,
      y: 5.15,
      w: 3.25,
      h: 0.45,
      fill: { color: WHITE },
      line: { color: tone, width: 1.25 },
      rectRadius: 0.22,
    });
    text(s, dataLabel(lang, label), { x: x + 0.3, y: 5.15, w: 3.25, h: 0.45 }, { fontSize: 13, bold: true, color: tone, align: "center", valign: "middle" });
  });
  const halves = changes.map((r) => (r.detail?.kind === "period_comparison" ? r.detail.comparison : null)).find((c) => c !== null);
  if (halves) {
    caption(s, t(lang, "{p} compared with {c}", { p: halves.period.name, c: halves.comparison_period.name }), { x: 0.6, y: 6.3, w: 12.15, h: 0.3 });
  }

  // 11. Agree actions: up to 3 proposed next steps with owners
  s = deck.content(t(lang, "Agree actions"), t(lang, "Proposed next steps"));
  if (steps.length === 0) text(s, t(lang, "No fired signals."), { x: 0.6, y: 1.9, w: 12, h: 0.4 }, { fontSize: 14, color: MUTED });
  steps.forEach((nextStep, i) => {
    const y = 1.8 + i * 1.4;
    card(s, { x: 0.6, y, w: 12.15, h: 1.25 });
    dot(s, nextStep.position, { x: 0.85, y: y + 0.37, w: 0.5, h: 0.5 }, RED);
    text(s, dataLabel(lang, nextStep.lever), { x: 1.6, y: y + 0.14, w: 8.6, h: 0.55 }, { fontSize: 16, bold: true, color: INK });
    const sites = [...new Set(nextStep.results.map((r) => siteName(r.site_id)))].join(", ");
    text(s, t(lang, "Sites: {x}", { x: sites }), { x: 1.6, y: y + 0.75, w: 8.6, h: 0.34 }, { fontSize: 12, color: MUTED });
    text(s, t(lang, "Owner: {x}", { x: dataLabel(lang, `${nextStep.lever_owner}_owner`) }), { x: 10.35, y: y + 0.4, w: 2.15, h: 0.45 }, {
      fontSize: 13,
      bold: true,
      color: NAVY,
      align: "right",
      valign: "middle",
    });
  });
  caption(s, t(lang, "Proposed by Lindström. We agree the final steps together in the meeting."), {
    x: 0.6,
    y: 1.8 + Math.max(steps.length, 1) * 1.4 + 0.05,
    w: 12.15,
    h: 0.3,
  });

  // 12. Close
  s = deck.dark(t(lang, "Agree actions"));
  text(s, t(lang, "Thank you"), { x: 0.6, y: 2.5, w: 8.4, h: 0.9 }, { fontSize: 44, bold: true, color: WHITE });
  text(s, t(lang, "Questions and discussion"), { x: 0.6, y: 3.45, w: 8.4, h: 0.6 }, { fontSize: 24, color: PALE });
  text(s, `${DEMO_KAM.name}\n${DEMO_KAM.email}`, { x: 0.6, y: 5.1, w: 6, h: 0.7 }, { fontSize: 14, color: WHITE });

  // JSZip builds the file in a plain ArrayBuffer, never a SharedArrayBuffer.
  return (await pres.write({ outputType: "uint8array" })) as Uint8Array<ArrayBuffer>;
}

/** The period as the deck names it: "2025", "H1 2025", "H2 2025" or a month such as "March 2025" in the language. */
export function periodName(lang: Lang, period: Period): string {
  const [year, part] = period.split("-");
  if (part === undefined) return year;
  if (part === "H1" || part === "H2") return `${part} ${year}`;
  return `${monthName(lang, period)} ${year}`;
}

/** A result the Customer view shows, or null for a Withheld one. */
function shown(answer: KpiAnswer): KpiResult | null {
  return "withheld" in answer ? null : answer;
}

/** An item of the Customer version of Data transparency. Its texts are English. */
function transparencyItem(id: string): DataTransparencyItem {
  return getViewsAndReview().data.views.data_transparency.customer.items.find((i) => i.id === id)!;
}

/** The text of a data gap in the Customer version of Data transparency, in English. */
function dataGap(id: string): string {
  return (transparencyItem("data_gaps").entries as ViewItem[]).find((g) => g.id === id)!.text;
}

function customerName(customer_id: string): string {
  return getMasterData().data.customers.find((c) => c.customer_id === customer_id)!.customer_name;
}

/**
 * The deck's 2 slide kinds. Every slide carries the Lindström logo and a footer with "ValueLens by Lindström", the
 * Customer and the period. They sit on each slide, not on a master, so every slide holds them.
 */
class Deck {
  private readonly logo = imageData("lindstrom-logo.png");
  private readonly logoWhite = imageData("lindstrom-logo-white.png");
  private readonly sections = new Set<string>();
  private readonly pres: pptxgen;
  private readonly footer: string;

  constructor(pres: pptxgen, footer: string) {
    this.pres = pres;
    this.footer = footer;
  }

  /** A white content slide in a section, with a title. The kicker above the title is the section, unless set. */
  content(section: string, title: string, kicker = section): Slide {
    const s = this.slide(section, WHITE);
    s.addImage({ data: this.logo, x: 11.05, y: 0.45, w: 1.7, h: 1.7 / LOGO_RATIO, altText: "Lindström" });
    text(s, kicker.toUpperCase(), { x: 0.6, y: 0.42, w: 10, h: 0.3 }, { fontSize: 12, bold: true, color: RED, charSpacing: 1 });
    text(s, title, { x: 0.6, y: 0.74, w: 10.2, h: 0.75 }, { fontSize: 30, bold: true, color: NAVY });
    text(s, this.footer, { x: 0.6, y: 6.95, w: 10, h: 0.3 }, { fontSize: 10, color: MUTED });
    return s;
  }

  /** A navy slide for the title and the close, with the white logo and a red circle. */
  dark(section: string): Slide {
    const s = this.slide(section, NAVY);
    s.addShape(this.pres.ShapeType.ellipse, { x: 9.2, y: 2.2, w: 6.2, h: 6.2, fill: { color: RED }, line: { color: RED } });
    s.addImage({ data: this.logoWhite, x: 0.6, y: 0.55, w: 2.4, h: 2.4 / LOGO_RATIO, altText: "Lindström" });
    text(s, this.footer, { x: 0.6, y: 6.95, w: 8.4, h: 0.3 }, { fontSize: 10, color: PALE });
    return s;
  }

  private slide(section: string, background: string): Slide {
    if (!this.sections.has(section)) {
      this.pres.addSection({ title: section });
      this.sections.add(section);
    }
    const s = this.pres.addSlide({ sectionTitle: section });
    s.background = { color: background };
    s.slideNumber = { x: 12.15, y: 6.95, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: background === NAVY ? PALE : MUTED, align: "right" };
    return s;
  }
}

/** A PNG from public/ as pptxgenjs image data. */
function imageData(file: string): string {
  return `image/png;base64,${readFileSync(join(process.cwd(), "public", file)).toString("base64")}`;
}

function text(s: Slide, value: string, box: Box, options: pptxgen.TextPropsOptions): void {
  s.addText(value, { ...box, fontFace: FONT, margin: 0, valign: "top", align: "left", ...options });
}

function heading(s: Slide, value: string, box: Box): void {
  text(s, value, box, { fontSize: 14, bold: true, color: INK });
}

function caption(s: Slide, value: string, box: Box): void {
  text(s, value, box, { fontSize: 11, color: MUTED });
}

function card(s: Slide, box: Box): void {
  s.addShape("roundRect", { ...box, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.12 });
}

function dot(s: Slide, n: number, box: Box, color: string): void {
  s.addShape("ellipse", { ...box, fill: { color }, line: { color } });
  text(s, String(n), box, { fontSize: box.w > 0.45 ? 16 : 12, bold: true, color: WHITE, align: "center", valign: "middle" });
}

/** A figure card: the value, its unit and the label. */
function stat(s: Slide, figure: Figure, box: Box): void {
  card(s, box);
  const inner = { x: box.x + 0.25, w: box.w - 0.5 };
  text(s, figure.value, { ...inner, y: box.y + 0.15, h: 0.6 }, { fontSize: 30, bold: true, color: NAVY, valign: "bottom" });
  if (figure.unit) text(s, figure.unit, { ...inner, y: box.y + 0.77, h: 0.28 }, { fontSize: 11, color: MUTED });
  text(s, figure.label, { ...inner, y: box.y + 1.07, h: box.h - 1.15 }, { fontSize: 12, color: INK });
}

function cell(value: string, options: pptxgen.TableCellProps = {}): pptxgen.TableCell {
  return { text: value, options };
}

function table(s: Slide, rows: pptxgen.TableRow[], box: Box, colW: number[], fontSize = 12, fill = WHITE): void {
  s.addTable(rows, {
    x: box.x,
    y: box.y,
    w: box.w,
    colW,
    fontFace: FONT,
    fontSize,
    color: INK,
    fill: { color: fill },
    border: { type: "solid", pt: 0.75, color: LINE },
    margin: 0.06,
    valign: "middle",
  });
}

/**
 * A KPI's 12 monthly values as a 2-row table, in place of a chart until #37. The title names the unit. A Withheld
 * month shows empty.
 */
function monthTable(s: Slide, lang: Lang, title: string, months: readonly string[], values: (KpiResult | null)[], y: number): void {
  text(s, title, { x: 0.6, y, w: 12.15, h: 0.35 }, { fontSize: 13, bold: true, color: INK });
  const head = months.map((m) => cell(monthName(lang, m, "short").replace(".", ""), { bold: true, align: "center", color: MUTED }));
  const row = values.map((r) => cell(r ? formatValue(lang, r).value : "", { align: "center" }));
  table(s, [head, row], { x: 0.6, y: y + 0.45, w: 12.15, h: 0 }, months.map(() => 12.15 / months.length), 11);
}
