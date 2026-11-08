import assert from "node:assert/strict";
import { test } from "node:test";

import { dataPage } from "../../lib/pages/data.ts";
import type { DataCard } from "./data-cards.ts";
import { dataCards } from "./data-cards.ts";

const cards = (lang: "en" | "sv" | "fi") => dataCards(lang, dataPage({ customer_id: "CUST001", period: "2025", view: "KAM" }));
const card = <Id extends DataCard["id"]>(lang: "en" | "sv" | "fi", id: Id) =>
  cards(lang).find((c): c is Extract<DataCard, { id: Id }> => c.id === id)!;

test("a threshold shows its name, data status and parameters in the language, and keeps its values", () => {
  const [health] = card("fi", "thresholds_and_guards").entries.filter((e) => e.catalogue_id.endsWith("on_time_service_cycle_share"));
  assert.equal(health.name_text, "Asiakkuuden tila, ajallaan toteutuneiden palvelukierrosten osuus");
  assert.equal(health.data_status_text, "TIIMIN OLETUS");
  assert.deepEqual(health.parameters.map((p) => [p.parameter_text, p.value]), [
    ["Vihreän raja", 0.97],
    ["Keltaisen raja", 0.95],
    ["Vähimmäismäärä", 100],
  ]);
});

test("a laundry's country, a baseline's selection status and a public figure's unit show in the language", () => {
  const countries = card("sv", "laundry_waste_factors").laundries.map((l) => l.country_text);
  assert.deepEqual([...new Set(countries)], ["Finland", "Sverige", "Polen"]);
  assert.deepEqual(card("fi", "baseline_used").baselines.map((b) => b.selection_text), ["Oletus", "Vaihtoehto", "Vaihtoehto"]);
  const figures = card("fi", "baseline_factors_and_dataset_actuals_against_public_figures").figures;
  assert.deepEqual([...new Set(figures.map((f) => f.unit_text))], ["kWh/kg", "l/kg", "kgCO2e/kg"]);
});

test("in English, a parameter reads as words", () => {
  const entries = card("en", "thresholds_and_guards").entries;
  assert.equal(entries.find((e) => e.parameters.length > 2 && e.name.endsWith("above peers"))?.parameters.at(-1)?.parameter_text, "Minimum peers");
});
