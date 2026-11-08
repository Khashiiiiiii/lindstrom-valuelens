import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";

import { listKpis, runKpi } from "../data.ts";

import type { DeckRequest } from "./deck.ts";
import { deckFile } from "./deck.ts";

const NORTHSTAR: DeckRequest = { customer_id: "CUST001", period: "2025", view: "Customer", lang: "en" };

/** The text of each slide in slide order, one line per text run, read from the returned file. */
async function slideTexts(file: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  return Promise.all(
    names.map(async (name) => {
      const xml = await zip.file(name)!.async("string");
      return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join("\n");
    }),
  );
}

function slideNumber(name: string): number {
  return Number(name.match(/slide(\d+)\.xml$/)![1]);
}

function decodeXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

test("the deck has 12 slides", async () => {
  assert.equal((await slideTexts(await deckFile(NORTHSTAR))).length, 12);
});

test("every slide holds the Customer name and the period", async () => {
  const cases: [DeckRequest, string][] = [
    [NORTHSTAR, "2025"],
    [{ ...NORTHSTAR, period: "2025-H2" }, "H2 2025"],
    [{ ...NORTHSTAR, period: "2025-03", lang: "fi" }, "maaliskuu 2025"],
    [{ customer_id: "CUST002", period: "2025-H1", view: "Customer", lang: "sv" }, "H1 2025"],
  ];
  for (const [request, period] of cases) {
    const customer = request.customer_id === "CUST001" ? "NorthStar Foods Group" : "Apex Industrial Systems";
    (await slideTexts(await deckFile(request))).forEach((text, i) => {
      assert.ok(text.includes(customer), `slide ${i + 1} of ${JSON.stringify(request)} names ${customer}`);
      assert.ok(text.includes(period), `slide ${i + 1} of ${JSON.stringify(request)} names ${period}`);
    });
  }
});

test("no slide holds account health or a KAM-only KPI, even when the request comes from the KAM view", async () => {
  const kamOnly = listKpis("KAM").filter((k) => k.view === "KAM").map((k) => k.name);
  assert.ok(kamOnly.includes("Account health"));
  for (const lang of ["en", "sv", "fi"] as const) {
    const kam = await slideTexts(await deckFile({ ...NORTHSTAR, view: "KAM", lang }));
    assert.deepEqual(kam, await slideTexts(await deckFile({ ...NORTHSTAR, view: "Customer", lang })));
    kam.forEach((text, i) => {
      for (const banned of [...kamOnly, "Kundhälsa", "Asiakkuuden tila"]) {
        assert.ok(!text.includes(banned), `slide ${i + 1} in ${lang} holds "${banned}"`);
      }
    });
  }
});

test("an SV or FI deck uses the dictionary and shows the AI translation note, and an EN deck has no note", async () => {
  const cases = [
    { lang: "sv", words: ["Tillbakablick", "Året i korthet", "Tack"], note: "AI-översättning. Förbehåll och assistentens svar är på engelska." },
    { lang: "fi", words: ["Katsaus taaksepäin", "Vuosi lyhyesti", "Kiitos"], note: "Tekoälykäännös. Varaumat ja avustajan vastaukset ovat englanniksi." },
  ] as const;
  for (const { lang, words, note } of cases) {
    const all = (await slideTexts(await deckFile({ ...NORTHSTAR, lang }))).join("\n");
    for (const word of [...words, note]) assert.ok(all.includes(word), `the ${lang} deck holds "${word}"`);
  }
  const english = (await slideTexts(await deckFile(NORTHSTAR))).join("\n");
  assert.ok(english.includes("Look back") && english.includes("Thank you"));
  assert.ok(!english.includes("AI translation"));
});

/** A chart part of the deck: its title and, per series, the name and the cached category labels and values. */
interface Chart {
  name: string;
  xml: string;
  series: { name: string; labels: string[]; values: string[]; ptCount: number }[];
}

async function charts(file: Uint8Array): Promise<Chart[]> {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
  return Promise.all(
    names.map(async (name) => {
      const xml = await zip.file(name)!.async("string");
      const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map(([, ser]) => {
        const values = ser.match(/<c:val>([\s\S]*?)<\/c:val>/)![1];
        return {
          name: points(ser.match(/<c:tx>([\s\S]*?)<\/c:tx>/)![1])[0],
          labels: points(ser.match(/<c:cat>([\s\S]*?)<\/c:cat>/)![1]),
          values: points(values),
          ptCount: Number(values.match(/<c:ptCount val="(\d+)"\/>/)![1]),
        };
      });
      return { name, xml, series };
    }),
  );
}

/** The values of the cached points in an XML block, in point order. */
function points(block: string): string[] {
  return [...block.matchAll(/<c:pt idx="\d+">\s*<c:v>([^<]*)<\/c:v>/g)].map((m) => m[1]);
}

test("the deck has native charts of washed kg, on-time share, emissions saved and the treatment routes, with every cached value set", async () => {
  const found = await charts(await deckFile(NORTHSTAR));
  assert.equal(found.length, 4);
  const titles = found.map((c) => decodeXml(c.xml.match(/<c:title>[\s\S]*?<a:t>([^<]*)<\/a:t>/)![1])).sort();
  assert.deepEqual(titles, [
    "Emissions saved per month, kg CO2e",
    "On-time service cycle share per month",
    "Textile waste by treatment route",
    "Washed kg per month",
  ]);
  for (const chart of found) {
    for (const s of chart.series) {
      assert.ok(s.name, `${chart.name} names its series`);
      assert.equal(s.labels.length, s.ptCount, `${chart.name} labels every point`);
      for (const v of s.values) assert.ok(v !== "" && Number.isFinite(Number(v)), `${chart.name} caches "${v}" as a number`);
      // NorthStar has a value in every month and every route, so no chart has a gap.
      assert.equal(s.values.length, s.ptCount, `${chart.name} caches every point`);
    }
  }
  const monthly = found.filter((c) => c.series[0].labels.length === 12);
  assert.equal(monthly.length, 3);
  assert.deepEqual(monthly[0].series[0].labels, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]);
});

/**
 * The cells of a workbook's first sheet by reference, such as "B2". Only numbers and inline strings are read. A
 * shared string reads as its index, so a workbook that uses them does not match its chart.
 */
async function sheetCells(workbook: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(workbook);
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const cells = new Map<string, string>();
  for (const [, ref, attrs, body] of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    cells.set(ref, attrs.includes('t="inlineStr"') ? body.match(/<t[^>]*>([^<]*)<\/t>/)![1] : body.match(/<v>([^<]*)<\/v>/)![1]);
  }
  return cells;
}

/** The cell references of a range in a chart formula, such as "Sheet1!$B$2:$B$13", in order. */
function rangeCells(formula: string): string[] {
  const [, col, from, to = from] = formula.match(/^Sheet1!\$([A-Z]+)\$(\d+)(?::\$[A-Z]+\$(\d+))?$/)!;
  return Array.from({ length: Number(to) - Number(from) + 1 }, (_, i) => `${col}${Number(from) + i}`);
}

test("every chart's embedded workbook holds the chart's cached values as plain cells, which Keynote reads", async () => {
  for (const request of [NORTHSTAR, { ...NORTHSTAR, lang: "fi" as const, period: "2025-H1" as const }]) {
    const file = await deckFile(request);
    const zip = await JSZip.loadAsync(file);
    for (const chart of await charts(file)) {
      const rels = await zip.file(chart.name.replace("charts/", "charts/_rels/") + ".rels")!.async("string");
      const target = rels.match(/Target="\.\.\/embeddings\/([^"]+\.xlsx)"/)![1];
      const cells = await sheetCells(await zip.file(`ppt/embeddings/${target}`)!.async("uint8array"));
      for (const [i, ser] of [...chart.xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].entries()) {
        const formula = (tag: string) => ser[1].match(new RegExp(`<c:${tag}>[\\s\\S]*?<c:f>([^<]*)</c:f>`))![1];
        const s = chart.series[i];
        assert.equal(cells.get(rangeCells(formula("tx"))[0]), s.name, `${chart.name} series name`);
        assert.deepEqual(rangeCells(formula("cat")).map((ref) => cells.get(ref)), s.labels, `${chart.name} labels`);
        assert.deepEqual(rangeCells(formula("val")).map((ref) => cells.get(ref)), s.values, `${chart.name} values`);
      }
    }
  }
});

test("the file has no folder entries, which the pptx validator warns can fail to open through a cloud service", async () => {
  const zip = await JSZip.loadAsync(await deckFile(NORTHSTAR));
  assert.deepEqual(Object.values(zip.files).filter((f) => f.dir).map((f) => f.name), []);
});

test("the treatment route chart labels each slice with the route's kg from runKpi, not a share the chart computes", async () => {
  const waste = runKpi("textile_waste_by_treatment_route", { scope: { customer_id: "CUST001" }, period: "2025", view: "Customer" });
  assert.ok(!("withheld" in waste) && waste.breakdown);
  const doughnut = (await charts(await deckFile(NORTHSTAR))).find((c) => c.xml.includes("<c:doughnutChart>"))!;
  assert.deepEqual(doughnut.series[0].values.map(Number), waste.breakdown.map((b) => b.value));
  const labels = doughnut.xml.match(/<c:dLbls>([\s\S]*?)<\/c:dLbls>/)![1];
  assert.match(labels, /<c:showVal val="1"\/>/);
  assert.match(labels, /<c:showPercent val="0"\/>/);
});
