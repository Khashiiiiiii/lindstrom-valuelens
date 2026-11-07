// PROTOTYPE, throw me away. Builds the PowerPoint export of the annual review for "Dashboard screens" (issue 16).
// Customer view only. Every number is a runKpi result passed in by server.ts. Charts are native PowerPoint charts,
// so the KAM can edit them. Slide text follows the app language through the same dictionary as the UI.

import pptxgen from "pptxgenjs";
import "./variant-d-dict.js";
import { fixForKeynote } from "./deck-fix.ts";

const I18N = (globalThis as any).I18N as Record<string, Record<string, string>>;
const LOGO = new URL("./assets/lindstrom-logo.png", import.meta.url).pathname;
const LOGO_WHITE = new URL("./assets/lindstrom-logo-white.png", import.meta.url).pathname;
const LOGO_RATIO = 2117 / 429;

// Lindström navy and red, read from the logo file. The rest are tints of the navy.
const NAVY = "003F72", RED = "E00034", INK = "1B2430", MUTED = "5B6B7F", TINT = "EEF3F8", LINE = "DCE4EE", SKY = "4F8FCB", PALE = "A9C8E6";
const FONT = "Arial";

export type DeckInput = {
  lang: "en" | "sv" | "fi";
  customer: { customer_name: string; industry: string };
  period: string;
  months: string[];
  user: { name: string; email: string };
  priorities: { id: string; name: string; results: any[] }[];
  kpi: (id: string) => any;
  site_count: number;
  series: Record<string, { values: (number | null)[] }>;
  waste: any;
  signal_groups: any[];
  next_steps: any[];
  siteName: (id: string) => string;
};

export async function buildDeck(d: DeckInput): Promise<Buffer> {
  const loc = { en: "en-GB", sv: "sv-SE", fi: "fi-FI" }[d.lang];
  const T = (s: string, vars?: Record<string, string | number>) => {
    let out = I18N[d.lang][s] ?? s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
  const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits })}${d.lang === "en" ? "%" : " %"}`;
  const num = (v: number) => v.toLocaleString(loc, { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
  const val = (r: any) => (r.value === null ? T("Not evaluated") : r.unit === "share" ? pct(r.value) : num(r.value));
  // Short units sit after the number. Long ones, such as "per 100 wearers per month", go in the label instead.
  const unit = (r: any) => (r.value === null || r.unit === "share" || T(r.unit).length > 12 ? "" : T(r.unit));
  // If the label already ends with the start of the unit, add only the rest: "Washes per garment" + "per month".
  const withUnit = (label: string, r: any) => {
    const u = T(r.unit);
    if (r.value === null || r.unit === "share" || u.length <= 12) return label;
    const words = u.split(" "), low = label.toLowerCase();
    // Also skip one leading unit word, for Finnish "Pesukerrat vaatetta kohden" + "pesua vaatetta kohden kuukaudessa".
    for (const i of [0, 1]) for (let k = words.length - 1; k > i; k--) {
      if (k - i >= 2 || i === 0) if (low.endsWith(words.slice(i, k).join(" ").toLowerCase())) return `${label} ${words.slice(k).join(" ")}`;
    }
    return `${label}, ${u}`;
  };
  const month = (i: number, style: "short" | "long" = "short") => new Date(2025, i, 1).toLocaleString(loc, { month: style }).replace(".", "");
  const periodLabel = d.period === "2025" ? "2025" : /H[12]$/.test(d.period) ? `${d.period.slice(5)} 2025` : `${month(d.months.indexOf(d.period), "long")} 2025`;
  const customer = d.customer.customer_name;

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
  pres.author = d.user.name;
  pres.company = "Lindström";
  pres.title = `${T("Annual value review")}, ${customer}, ${periodLabel}`;
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  const footer = `${T("ValueLens by Lindström")}   |   ${customer}   |   ${periodLabel}`;
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { image: { x: 11.05, y: 0.45, w: 1.7, h: 1.7 / LOGO_RATIO, path: LOGO, altText: "Lindström" } },
      { text: { text: footer, options: { x: 0.6, y: 6.95, w: 10, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 } } },
      { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 0.42, w: 10, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: RED, charSpacing: 1, margin: 0, align: "left" }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.74, w: 10.2, h: 0.75, fontFace: FONT, fontSize: 30, bold: true, color: NAVY, margin: 0, valign: "top", align: "left" }, text: "" } },
    ],
    slideNumber: { x: 12.15, y: 6.95, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: "right" },
  });
  pres.defineSlideMaster({
    title: "DARK",
    background: { color: NAVY },
    objects: [
      { image: { x: 0.6, y: 0.55, w: 2.4, h: 2.4 / LOGO_RATIO, path: LOGO_WHITE, altText: "Lindström" } },
      { text: { text: footer, options: { x: 0.6, y: 6.95, w: 10, h: 0.3, fontFace: FONT, fontSize: 10, color: PALE, margin: 0 } } },
    ],
  });

  const content = (section: string, kicker: string, title: string) => {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
    s.addText(kicker.toUpperCase(), { placeholder: "kicker" });
    s.addText(title, { placeholder: "title" });
    return s;
  };
  const caption = (s: any, text: string, x: number, y: number, w: number, name: string) =>
    s.addText(text, { x, y, w, h: 0.3, fontSize: 11, color: MUTED, margin: 0, isTextBox: true, objectName: name });
  const card = (s: any, x: number, y: number, w: number, h: number, name: string) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.12, objectName: name });
  const stat = (s: any, r: any, label: string, x: number, y: number, w: number, h: number, name: string, big = 32) => {
    card(s, x, y, w, h, name + " card");
    s.addText([{ text: val(r), options: { fontSize: big, bold: true, color: NAVY } }, { text: unit(r) ? " " + unit(r) : "", options: { fontSize: 14, color: MUTED } }],
      { x: x + 0.25, y: y + 0.18, w: w - 0.5, h: h * 0.5, margin: 0, valign: "bottom", isTextBox: true, objectName: name + " value" });
    s.addText(withUnit(label, r), { x: x + 0.25, y: y + 0.18 + h * 0.52, w: w - 0.5, h: h * 0.4 - 0.18, fontSize: 13, color: INK, margin: 0, valign: "top", isTextBox: true, objectName: name + " label" });
  };
  const dot = (s: any, n: number | string, x: number, y: number, color: string, name: string, size = 0.5) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color }, line: { color }, objectName: name + " circle" });
    s.addText(String(n), { x, y, w: size, h: size, fontSize: size > 0.45 ? 16 : 12, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: name + " number" });
  };
  // Chart text uses the theme body font. Labels look the same on every chart.
  const axis = () => ({
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
    catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", valGridLine: { color: LINE, size: 0.75 }, catGridLine: { style: "none" as const },
    catAxisLineShow: false, valAxisLineShow: false, showLegend: false, dataLabelColor: INK, dataLabelFontSize: 10, dataLabelFontFace: "+mn-lt",
  });
  const labels = d.months.map((_, i) => month(i));
  const series = (id: string) => (d.series[id]?.values ?? []).map((v) => v ?? 0);
  const P = T; // part names
  const parts = ["Look back", "Show value", "Build trust", "Look forward", "Agree actions"];

  // 1. Title
  pres.addSection({ title: T("Annual value review") });
  let s = pres.addSlide({ masterName: "DARK", sectionTitle: T("Annual value review") });
  s.addShape(pres.shapes.OVAL, { x: 9.2, y: 2.2, w: 6.2, h: 6.2, fill: { color: RED }, line: { color: RED }, objectName: "Red circle" });
  s.addShape(pres.shapes.OVAL, { x: 8.3, y: -1.6, w: 3.4, h: 3.4, fill: { color: "FFFFFF", transparency: 88 }, line: { color: "FFFFFF", transparency: 88 }, objectName: "Pale circle" });
  s.addText(T("Annual value review"), { x: 0.6, y: 2.3, w: 8.4, h: 0.9, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "Title" });
  s.addText(customer, { x: 0.6, y: 3.25, w: 8.4, h: 0.7, fontSize: 28, color: PALE, margin: 0, isTextBox: true, objectName: "Customer" });
  s.addText(periodLabel, { x: 0.6, y: 3.95, w: 8.4, h: 0.5, fontSize: 20, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "Period" });
  s.addText([{ text: T("Prepared by {name}, Lindström", { name: d.user.name }), options: { breakLine: true } }, { text: T("Customer view. Synthetic data.") }],
    { x: 0.6, y: 5.3, w: 8, h: 0.7, fontSize: 14, color: PALE, margin: 0, isTextBox: true, objectName: "Prepared by" });

  // 2. Agenda with the 5 review parts and the Customer's priorities
  pres.addSection({ title: T("Agenda") });
  s = content(T("Agenda"), T("Annual value review"), T("Agenda"));
  const partText = ["Service performance and adoption", "Operational and sustainability value", "How we read the data", "Where to improve next", "Up to 3 proposed next steps"];
  parts.forEach((p, i) => {
    const y = 1.85 + i * 0.95;
    dot(s, i + 1, 0.6, y, NAVY, `Agenda ${i + 1}`);
    s.addText(P(p), { x: 1.3, y: y - 0.04, w: 6, h: 0.34, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true, objectName: `Agenda ${i + 1} name` });
    s.addText(T(partText[i]), { x: 1.3, y: y + 0.3, w: 6, h: 0.3, fontSize: 13, color: MUTED, margin: 0, isTextBox: true, objectName: `Agenda ${i + 1} text` });
  });
  card(s, 8.1, 1.85, 4.65, 4.4, "Priorities panel");
  s.addText(T("Your priorities"), { x: 8.45, y: 2.1, w: 4, h: 0.4, fontSize: 18, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: "Priorities heading" });
  d.priorities.forEach((p, i) => {
    dot(s, i + 1, 8.45, 2.75 + i * 0.85, RED, `Priority ${i + 1}`, 0.42);
    s.addText(T(p.name), { x: 9.05, y: 2.75 + i * 0.85, w: 3.5, h: 0.42, fontSize: 16, color: INK, valign: "middle", margin: 0, isTextBox: true, objectName: `Priority ${i + 1} name` });
  });

  // 3. Look back: the year at a glance
  pres.addSection({ title: P("Look back") });
  s = content(P("Look back"), P("Look back"), T("The year at a glance"));
  const glance = [
    [{ value: d.site_count, unit: "Sites_unit" }, T("Site count")],
    [d.kpi("active_wearers"), T("Active wearers")],
    [d.kpi("garments_in_circulation"), T("Garments in circulation")],
    [d.kpi("washed_kg"), T("Washed kg")],
  ];
  glance.forEach(([r, l], i) => stat(s, r, l as string, 0.6 + i * 3.1, 1.75, 2.85, 1.45, `Glance ${i + 1}`));
  s.addChart(pres.charts.BAR, [{ name: T("Washed kg"), labels, values: series("washed_kg") }], {
    x: 0.6, y: 3.55, w: 12.15, h: 3.0, barDir: "col", chartColors: [NAVY], barGapWidthPct: 55, valAxisLabelFormatCode: "#,##0", ...axis(),
    showTitle: true, title: T("Washed kg per month"), titleFontSize: 13, titleColor: INK, titleFontFace: "+mn-lt", objectName: "Washed kg chart",
  } as any);

  // 4. Look back: service performance
  s = content(P("Look back"), P("Look back"), T("Service performance"));
  const onTime = d.kpi("on_time_service_cycle_share");
  card(s, 0.6, 1.75, 3.9, 2.1, "On-time card");
  s.addText(pct(onTime.value), { x: 0.85, y: 1.95, w: 3.4, h: 1.1, fontSize: 54, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: "On-time value" });
  s.addText(T("On-time service cycle share"), { x: 0.85, y: 3.05, w: 3.4, h: 0.6, fontSize: 14, color: INK, margin: 0, valign: "top", isTextBox: true, objectName: "On-time label" });
  stat(s, d.kpi("turnaround_hours_median"), T("Turnaround hours, median"), 0.6, 4.05, 1.85, 2.15, "Turnaround", 26);
  stat(s, d.kpi("service_requests_per_100_wearers"), T("Service requests per 100 wearers"), 2.65, 4.05, 1.85, 2.15, "Service requests", 26);
  const ot = series("on_time_service_cycle_share");
  s.addChart(pres.charts.LINE, [{ name: T("On-time service cycle share"), labels, values: ot }], {
    x: 4.9, y: 1.75, w: 7.85, h: 4.45, chartColors: [NAVY], lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 8,
    valAxisMinVal: Math.floor(Math.min(...ot) * 100 - 1) / 100, valAxisMaxVal: 1, valAxisLabelFormatCode: "0%", ...axis(),
    showValue: true, dataLabelPosition: "t", dataLabelFormatCode: "0.0%",
    showTitle: true, title: T("On-time service cycle share per month"), titleFontSize: 13, titleColor: INK, titleFontFace: "+mn-lt", objectName: "On-time chart",
  } as any);
  caption(s, T("Full year 2025, by month."), 4.9, 6.3, 7.85, "On-time caption");

  // 5. Show value: sustainability
  pres.addSection({ title: P("Show value") });
  s = content(P("Show value"), P("Show value"), T("Sustainability value"));
  [["emissions_saved", "Emissions saved"], ["water_saved", "Water saved"], ["energy_saved", "Energy saved"]].forEach(([id, l], i) =>
    stat(s, d.kpi(id), T(l), 0.6, 1.75 + i * 1.5, 3.9, 1.3, `Saved ${i + 1}`, 28));
  s.addChart(pres.charts.BAR, [{ name: T("Emissions saved"), labels, values: series("emissions_saved") }], {
    x: 4.9, y: 1.75, w: 7.85, h: 4.25, barDir: "col", chartColors: [SKY], barGapWidthPct: 55, valAxisLabelFormatCode: "#,##0", ...axis(),
    showTitle: true, title: T("Emissions saved per month, kg CO2e"), titleFontSize: 13, titleColor: INK, titleFontFace: "+mn-lt", objectName: "Emissions chart",
  } as any);
  caption(s, T("Compared with outsourced local laundry. The savings may be overstated."), 4.9, 6.05, 7.85, "Baseline caption");
  caption(s, T("Financial value is not shown, because the data holds no Customer cost or price."), 4.9, 6.38, 7.85, "Financial caption");

  // 6. Show value: circularity
  s = content(P("Show value"), P("Show value"), T("Circularity and textile waste"));
  if (d.waste?.breakdown) {
    s.addChart(pres.charts.DOUGHNUT, [{ name: T("Textile waste by treatment route"), labels: d.waste.breakdown.map((p: any) => T(p.key)), values: d.waste.breakdown.map((p: any) => p.value) }], {
      x: 0.6, y: 1.7, w: 6.2, h: 4.6, holeSize: 58, chartColors: [NAVY, SKY, PALE, RED], showPercent: true, showValue: false, showLegend: true, legendPos: "r",
      legendFontSize: 13, legendFontFace: "+mn-lt", legendColor: INK, dataLabelColor: "FFFFFF", dataLabelFontSize: 11, dataLabelFontFace: "+mn-lt", dataBorder: { pt: 1.5, color: "FFFFFF" },
      showTitle: true, title: T("Textile waste by treatment route"), titleFontSize: 13, titleColor: INK, titleFontFace: "+mn-lt", objectName: "Waste route chart",
    } as any);
    caption(s, T("Laundry outcome, the Customer cannot influence the route mix."), 0.6, 6.35, 6.2, "Waste caption");
  }
  [["repairs", "Repairs"], ["repair_rate", "Repair rate"], ["recycled_or_reused_share", "Recycled or reused share"], ["avoided_product_co2e_estimated", "Avoided product CO2e (estimated)"]].forEach(([id, l], i) =>
    stat(s, d.kpi(id), T(l), 7.2 + (i % 2) * 2.85, 1.75 + Math.floor(i / 2) * 2.3, 2.7, 2.1, `Circularity ${i + 1}`, 26));

  // 7. Your priorities
  s = content(P("Show value"), P("Show value"), T("Your priorities"));
  d.priorities.forEach((p, i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.75, 3.85, 4.75, `Priority block ${i + 1}`);
    dot(s, i + 1, x + 0.25, 2.0, RED, `Priority block ${i + 1}`, 0.42);
    s.addText(T(p.name), { x: x + 0.8, y: 2.0, w: 2.85, h: 0.42, fontSize: 18, bold: true, color: NAVY, valign: "middle", margin: 0, isTextBox: true, objectName: `Priority block ${i + 1} name` });
    p.results.slice(0, 3).forEach((r, k) => {
      const y = 2.7 + k * 1.22;
      s.addText([{ text: val(r), options: { fontSize: 24, bold: true, color: INK } }, { text: unit(r) ? " " + unit(r) : "", options: { fontSize: 12, color: MUTED } }],
        { x: x + 0.25, y, w: 3.35, h: 0.5, margin: 0, valign: "bottom", isTextBox: true, objectName: `Priority block ${i + 1} value ${k + 1}` });
      s.addText(withUnit(T(r.name), r), { x: x + 0.25, y: y + 0.52, w: 3.35, h: 0.55, fontSize: 12, color: MUTED, margin: 0, valign: "top", isTextBox: true, objectName: `Priority block ${i + 1} label ${k + 1}` });
    });
  });

  // 8. Build trust
  pres.addSection({ title: P("Build trust") });
  s = content(P("Build trust"), P("Build trust"), T("How we read the data"));
  const notes = ["Every figure comes from synthetic 2025 data for this prototype.", "Savings are compared with outsourced local laundry and may be overstated.", "Customer Experience data is not available yet, so satisfaction is not shown."];
  notes.forEach((n, i) => {
    dot(s, i + 1, 0.6, 1.9 + i * 1.3, NAVY, `Note ${i + 1}`, 0.42);
    s.addText(T(n), { x: 1.2, y: 1.84 + i * 1.3, w: 5.6, h: 0.9, fontSize: 15, color: INK, margin: 0, valign: "top", isTextBox: true, objectName: `Note ${i + 1} text` });
  });
  card(s, 7.3, 1.75, 5.45, 4.6, "Status panel");
  s.addText(T("Data status"), { x: 7.65, y: 2.0, w: 4.8, h: 0.4, fontSize: 18, bold: true, color: NAVY, margin: 0, isTextBox: true, objectName: "Status heading" });
  [["SYNTHETIC", "Counted directly in the synthetic data.", NAVY], ["SYNTHETIC_ESTIMATE", "Calculated with factors from the synthetic data.", SKY], ["ALLOCATED_ESTIMATE_SYNTHETIC", "The Customer's share of laundry totals, calculated with factors.", RED]].forEach(([k, t, c], i) => {
    const y = 2.65 + i * 1.2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.65, y, w: 4.75, h: 0.36, fill: { color: "FFFFFF" }, line: { color: c, width: 1.25 }, rectRadius: 0.18, objectName: `Status ${i + 1} chip` });
    s.addText(T(k), { x: 7.8, y, w: 4.45, h: 0.36, fontSize: 11, bold: true, color: c, valign: "middle", margin: 0, isTextBox: true, objectName: `Status ${i + 1} name` });
    s.addText(T(t), { x: 7.65, y: y + 0.44, w: 4.75, h: 0.6, fontSize: 13, color: INK, margin: 0, valign: "top", isTextBox: true, objectName: `Status ${i + 1} text` });
  });

  // 9. Look forward: fired signals, full width so long Swedish and Finnish names fit
  pres.addSection({ title: P("Look forward") });
  s = content(P("Look forward"), P("Look forward"), T("Where to improve next"));
  const groups = d.signal_groups.slice(0, 5);
  if (groups.length) {
    s.addChart(pres.charts.BAR, [{ name: T("Largest gap above peers, by signal"), labels: groups.map((g) => T(g.name)).reverse(), values: groups.map((g) => g.largest_gap).reverse() }], {
      x: 0.6, y: 1.7, w: 12.15, h: 4.6, barDir: "bar", chartColors: [RED], barGapWidthPct: 45, valAxisLabelFormatCode: "0%", ...axis(), catAxisLabelFontSize: 12,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0%", valAxisHidden: true, valGridLine: { style: "none" },
      showTitle: true, title: T("Largest gap above peers, by signal"), titleFontSize: 13, titleColor: INK, titleFontFace: "+mn-lt", objectName: "Signal gap chart",
    } as any);
  }

  // 10. Look forward: change from H1 to H2 at Customer grain
  s = content(P("Look forward"), P("Look forward"), T("Change from H1 to H2"));
  ["improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage"].forEach((id, i) => {
    const r = d.kpi(id), c = r.detail?.comparison, x = 0.6 + i * 4.1;
    const name = { improvement_on_time_service_cycles: "On-time service cycle share", improvement_service_requests: "Service requests per 100 wearers", improvement_scan_coverage: "Scan coverage" }[id]!;
    const fmt = (v: number) => (r.unit === "share" ? pct(v) : num(v));
    card(s, x, 1.75, 3.85, 4.4, `Change ${i + 1}`);
    s.addText(T(name), { x: x + 0.3, y: 2.0, w: 3.25, h: 0.75, fontSize: 16, bold: true, color: NAVY, margin: 0, valign: "top", isTextBox: true, objectName: `Change ${i + 1} name` });
    ["H1", "H2"].forEach((h, k) => {
      const v = c ? fmt(k ? c.period.value : c.comparison_period.value) : "";
      s.addText(h, { x: x + 0.3, y: 2.95 + k * 1.0, w: 0.7, h: 0.6, fontSize: 14, color: MUTED, margin: 0, valign: "middle", isTextBox: true, objectName: `Change ${i + 1} ${h}` });
      s.addText(v, { x: x + 1.0, y: 2.95 + k * 1.0, w: 2.55, h: 0.6, fontSize: 30, bold: true, color: k ? NAVY : MUTED, margin: 0, valign: "middle", isTextBox: true, objectName: `Change ${i + 1} ${h} value` });
    });
    const label = c?.label ?? "not_evaluated", lc = label === "worse" ? RED : label === "improved" ? NAVY : MUTED;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.3, y: 5.15, w: 3.25, h: 0.45, fill: { color: "FFFFFF" }, line: { color: lc, width: 1.25 }, rectRadius: 0.22, objectName: `Change ${i + 1} chip` });
    s.addText(T(label), { x: x + 0.3, y: 5.15, w: 3.25, h: 0.45, fontSize: 13, bold: true, color: lc, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Change ${i + 1} label` });
  });

  // 11. Agree actions
  pres.addSection({ title: P("Agree actions") });
  s = content(P("Agree actions"), P("Agree actions"), T("Proposed next steps"));
  d.next_steps.forEach((n, i) => {
    const y = 1.8 + i * 1.5;
    card(s, 0.6, y, 12.15, 1.35, `Step ${i + 1}`);
    dot(s, i + 1, 0.85, y + 0.42, RED, `Step ${i + 1}`);
    s.addText(T(n.lever), { x: 1.6, y: y + 0.16, w: 8.6, h: 0.62, fontSize: 16, bold: true, color: INK, margin: 0, valign: "top", isTextBox: true, objectName: `Step ${i + 1} lever` });
    const sites = [...new Set(n.results.map((r: any) => d.siteName(r.site_id)))].slice(0, 4).join(", ");
    s.addText(T("Sites: {x}", { x: sites }), { x: 1.6, y: y + 0.85, w: 8.6, h: 0.34, fontSize: 12, color: MUTED, margin: 0, isTextBox: true, objectName: `Step ${i + 1} sites` });
    s.addText(T("Owner: {x}", { x: T(n.lever_owner) }), { x: 10.35, y: y + 0.45, w: 2.15, h: 0.45, fontSize: 13, bold: true, color: NAVY, align: "right", valign: "middle", margin: 0, isTextBox: true, objectName: `Step ${i + 1} owner` });
  });
  caption(s, T("Proposed by Lindström. We agree the final steps together in the meeting."), 0.6, 1.8 + d.next_steps.length * 1.5 + 0.05, 12.15, "Steps caption");

  // 12. Close
  s = pres.addSlide({ masterName: "DARK", sectionTitle: P("Agree actions") });
  s.addShape(pres.shapes.OVAL, { x: 9.2, y: 2.2, w: 6.2, h: 6.2, fill: { color: RED }, line: { color: RED }, objectName: "Red circle" });
  s.addText(T("Thank you"), { x: 0.6, y: 2.5, w: 8.4, h: 0.9, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "Thank you" });
  s.addText(T("Questions and discussion"), { x: 0.6, y: 3.45, w: 8.4, h: 0.6, fontSize: 24, color: PALE, margin: 0, isTextBox: true, objectName: "Questions" });
  s.addText([{ text: d.user.name, options: { bold: true, breakLine: true } }, { text: d.user.email }], { x: 0.6, y: 5.1, w: 6, h: 0.7, fontSize: 14, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "Contact" });

  return fixForKeynote((await pres.write({ outputType: "nodebuffer" })) as Buffer);
}
