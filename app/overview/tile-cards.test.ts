import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataPage } from "../../lib/pages/metadata.ts";
import { overviewPage } from "../../lib/pages/overview.ts";
import { seriesPage } from "../../lib/pages/series.ts";
import { tileCards } from "./tile-cards.ts";

const request = { customer_id: "CUST001", period: "2025", view: "KAM" } as const;
const page = overviewPage(request);
const meta = metadataPage(request);
const series = seriesPage(request);
const card = (lang: "en" | "sv" | "fi", id: string) => tileCards(lang, { page, meta, site_id: null, series }).find((c) => c.id === id)!;

test("the 9 tiles keep the fixed order, each with value, unit and data status", () => {
  const cards = tileCards("en", { page, meta, site_id: null, series });
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
    { label: null, value: "24", unit: "Sites", data_status: "SYNTHETIC", baseline: null, caveats: [], sparkline: null },
  ]);
  const { sparkline, ...wearers } = card("en", "active_wearers").figures[0];
  assert.deepEqual(sparkline?.slice(0, 3), [9596, 9686, 9636]);
  assert.deepEqual(wearers, {
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
    tileCards("fi", { page: site, meta, site_id: "S008", series: null }).find((c) => c.id === "site_count")!.figures[0].unit,
    "toimipaikka",
  );
});

test("a tile whose answers are all Withheld does not show", () => {
  const withheld = { ...page, tiles: page.tiles.map((t) => (t.id === "repairs" ? { ...t, answers: [{ kpi_id: "repairs", withheld: true as const, reason: "KAM view only" as const }] } : t)) };
  const ids = tileCards("en", { page: withheld, meta, site_id: null, series }).map((c) => c.id);
  assert.equal(ids.length, 8);
  assert.ok(!ids.includes("repairs"));
  assert.ok(ids.includes("site_count") && ids.includes("optimisation_potential"), "tiles with no KPI still show");
});

test("only On-time service cycle share and Service requests per 100 wearers carry a badge, with the comparison label", () => {
  const cards = tileCards("en", { page, meta, site_id: null, series });
  assert.deepEqual(
    cards.filter((c) => c.badge !== null).map((c) => [c.id, c.badge!.label, c.badge!.tone]),
    [
      ["on_time_service_cycle_share", "No clear change", "neutral"],
      ["service_requests_per_100_wearers", "No clear change", "neutral"],
    ],
  );
});

test("Improved shows green and Worse shows red", () => {
  const badge = (customer_id: string, period: string, lang: "en" | "sv" | "fi" = "en") => {
    const r = { customer_id, period, view: "Customer" } as const;
    return tileCards(lang, { page: overviewPage(r), meta: metadataPage(r), site_id: null, series: null }).find((c) => c.id === "service_requests_per_100_wearers")!.badge;
  };
  // NorthStar's service requests per 100 wearers went up from February to March, a clear change.
  assert.deepEqual(badge("CUST001", "2025-03"), {
    label: "Worse",
    tone: "bad",
    compared: "March 2025 compared with February 2025",
    caveats: [],
  });
  assert.deepEqual(badge("CUST003", "2025-04"), {
    label: "Improved",
    tone: "good",
    compared: "April 2025 compared with March 2025",
    caveats: [],
  });
  assert.deepEqual(badge("CUST003", "2025-04", "fi"), {
    label: "Parantunut",
    tone: "good",
    compared: "Huhtikuu 2025 verrattuna jaksoon maaliskuu 2025",
    caveats: [],
  });
  assert.deepEqual(badge("CUST003", "2025-04", "sv"), {
    label: "Förbättrad",
    tone: "good",
    compared: "April 2025 jämfört med mars 2025",
    caveats: [],
  });
  assert.deepEqual(badge("CUST001", "2025-01"), { label: "Not evaluated", tone: "neutral", compared: null, caveats: [] });
  assert.equal(badge("CUST001", "2025")!.compared, "H2 2025 compared with H1 2025");
});

test("a Site badge in the KAM view carries the chance caveat, in English", () => {
  const r = { customer_id: "CUST001", site_id: "S008", period: "2025", view: "KAM" } as const;
  const cards = tileCards("fi", { page: overviewPage(r), meta: metadataPage(r), site_id: "S008", series: null });
  assert.deepEqual(cards.find((c) => c.id === "service_requests_per_100_wearers")!.badge!.caveats, [
    "About 1 in 20 Sites shows a clear change by chance alone.",
  ]);
  assert.deepEqual(cards.find((c) => c.id === "on_time_service_cycle_share")!.badge!.caveats, [
    "About 1 in 20 Sites shows a clear change by chance alone.",
    "Based on a sample of tracked garments.",
  ]);
});

test("a Withheld badge does not show", () => {
  const r = { customer_id: "CUST001", site_id: "S008", period: "2025", view: "Customer" } as const;
  assert.ok(tileCards("en", { page: overviewPage(r), meta: metadataPage(r), site_id: "S008", series: null }).every((c) => c.badge === null));
});

test("each KPI figure has a sparkline of its 12 months, and the tiles with no KPI have none", () => {
  const cards = tileCards("en", { page, meta, site_id: null, series });
  const washed = card("en", "washed_kg").figures[0].sparkline!;
  assert.equal(washed.length, 12);
  // NorthStar's January values, the sums of its January month facts.
  assert.equal(washed[0], 42880.8);
  const saved = card("en", "emissions_saved_and_water_saved").figures.map((f) => [f.sparkline!.length, f.sparkline![0]]);
  assert.deepEqual(saved, [
    [12, 21105.024],
    [12, 172105.1],
  ]);
  assert.deepEqual(
    cards.filter((c) => c.figures.some((f) => f.sparkline === null)).map((c) => c.id),
    ["site_count", "optimisation_potential"],
  );
  assert.ok(tileCards("en", { page, meta, site_id: null, series: null }).every((c) => c.figures.every((f) => f.sparkline === null)), "no series loaded yet");
});

test("a series whose first point is Withheld has no sparkline", () => {
  const withheld = {
    ...series,
    series: series.series.map((s) =>
      s.kpi_id === "repairs" ? { ...s, points: s.points.map(() => ({ kpi_id: "repairs", withheld: true as const, reason: "KAM view only" as const })) } : s,
    ),
  };
  assert.equal(tileCards("en", { page, meta, site_id: null, series: withheld }).find((c) => c.id === "repairs")!.figures[0].sparkline, null);
});
