import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataPage } from "../../lib/pages/metadata.ts";
import { overviewPage } from "../../lib/pages/overview.ts";
import { tileCards } from "./tile-cards.ts";

const request = { customer_id: "CUST001", period: "2025", view: "KAM" } as const;
const page = overviewPage(request);
const meta = metadataPage(request);
const card = (lang: "en" | "sv" | "fi", id: string) => tileCards(lang, page, meta, null).find((c) => c.id === id)!;

test("the 9 tiles keep the fixed order, each with value, unit and data status", () => {
  const cards = tileCards("en", page, meta, null);
  assert.deepEqual(
    cards.map((c) => c.name),
    [
      "Site count",
      "Active wearers",
      "Garments in circulation",
      "Washed kg",
      "Repairs",
      "On-time service cycle share",
      "Service requests per 100 wearers",
      "Emissions saved and Water saved",
      "Optimisation potential",
    ],
  );
  assert.deepEqual(card("en", "site_count").figures, [
    { label: null, value: "24", unit: "Sites", data_status: "SYNTHETIC", baseline: null, caveats: [] },
  ]);
  assert.deepEqual(card("en", "active_wearers").figures[0], {
    label: null,
    value: "9,647",
    unit: "wearers",
    data_status: "SYNTHETIC",
    baseline: null,
    caveats: [],
  });
  assert.equal(card("en", "on_time_service_cycle_share").figures[0].value, "98.3%");
  assert.equal(card("en", "on_time_service_cycle_share").figures[0].unit, "");
  const saved = card("en", "emissions_saved_and_water_saved").figures;
  assert.deepEqual(
    saved.map((f) => [f.label, f.value, f.unit, f.data_status, f.baseline, f.caveats.length]),
    [
      ["Emissions saved", "255,074", "kg CO2e", "ALLOCATED ESTIMATE, SYNTHETIC", "vs outsourced local laundry", 2],
      ["Water saved", "1,406,483", "l", "ALLOCATED ESTIMATE, SYNTHETIC", "vs outsourced local laundry", 0],
    ],
  );
  const potential = card("en", "optimisation_potential");
  assert.deepEqual([potential.figures[0].value, potential.figures[0].unit], ["18", "fired results across 6 signals"]);
  assert.deepEqual(potential.notes, ["Top: Washes per garment above peers", "Signals judge all of 2025."]);
});

test("switching to SV translates the tile names, units and data statuses", () => {
  assert.equal(card("sv", "site_count").name, "Antal anläggningar");
  assert.deepEqual(card("sv", "site_count").figures[0].unit, "anläggningar");
  const wearers = card("sv", "active_wearers").figures[0];
  assert.deepEqual([wearers.value, wearers.unit, wearers.data_status], ["9 647", "bärare", "SYNTETISK"]);
  assert.equal(card("sv", "on_time_service_cycle_share").figures[0].value, "98,3 %");
  const saved = card("sv", "emissions_saved_and_water_saved").figures[0];
  assert.deepEqual(
    [saved.label, saved.data_status, saved.baseline],
    ["Sparade utsläpp", "FÖRDELAD UPPSKATTNING, SYNTETISK", "jämfört med lokalt tvätteri på entreprenad"],
  );
  assert.equal(card("sv", "optimisation_potential").figures[0].unit, "utlösta resultat i 6 signaler");
});

test("switching to FI translates the tile names, units and data statuses", () => {
  const sites = card("fi", "site_count");
  assert.deepEqual([sites.name, sites.figures[0].unit, sites.figures[0].data_status], ["Toimipaikkojen määrä", "toimipaikkaa", "SYNTEETTINEN"]);
  assert.deepEqual([card("fi", "repairs").name, card("fi", "repairs").figures[0].unit], ["Korjaukset", "kpl"]);
  assert.equal(card("fi", "emissions_saved_and_water_saved").figures[1].data_status, "KOHDISTETTU ARVIO, SYNTEETTINEN");
  assert.deepEqual(card("fi", "optimisation_potential").notes, [
    "Kärjessä: Enemmän pesukertoja vaatetta kohden kuin asiakkaan muissa toimipaikoissa",
    "Signaalit arvioivat koko vuoden 2025.",
  ]);
});

test("caveats stay English in every language", () => {
  const caveats = card("fi", "emissions_saved_and_water_saved").figures[0].caveats;
  assert.equal(caveats[0], "Baseline factors are illustrative. Savings may be overstated.");
});

test("a Site filter counts 1 Site, in the singular", () => {
  const site = overviewPage({ ...request, site_id: "S008" });
  assert.deepEqual(
    tileCards("fi", site, meta, "S008").find((c) => c.id === "site_count")!.figures[0].unit,
    "toimipaikka",
  );
});

test("a tile whose answers are all Withheld does not show", () => {
  const withheld = { ...page, tiles: page.tiles.map((t) => (t.id === "repairs" ? { ...t, answers: [{ kpi_id: "repairs", withheld: true as const, reason: "KAM view only" as const }] } : t)) };
  const ids = tileCards("en", withheld, meta, null).map((c) => c.id);
  assert.equal(ids.length, 8);
  assert.ok(!ids.includes("repairs"));
  assert.ok(ids.includes("site_count") && ids.includes("optimisation_potential"), "tiles with no KPI still show");
});
