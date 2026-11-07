import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";

import { listKpis } from "../data.ts";

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
