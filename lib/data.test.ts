import assert from "node:assert/strict";
import { test } from "node:test";

import { getMasterData, getOperationalCircularityKpis, getPublicReference, getServiceKpis } from "./data.ts";

test("getMasterData reads the generated master data", () => {
  const master = getMasterData();
  assert.equal(master.data.customers.length, 3);
  assert.equal(master.data.sites.length, 34);
  assert.equal(master.data.default_baseline_id, "B_LOCAL");
  assert.deepEqual(master.data.customers[0].priority_topics.slice(0, 2), ["Water efficiency", "Hygiene"]);
});

test("getMasterData reads the file once and returns the cached result", () => {
  assert.equal(getMasterData(), getMasterData());
});

test("getOperationalCircularityKpis reads the generated operational and circularity KPIs", () => {
  const file = getOperationalCircularityKpis();
  assert.equal(file.meta.name, "operational-circularity-kpis");
  assert.equal(file.catalogue.length, 8);
  assert.equal(file.data.defaults.postponement_ratio, 1);
  assert.equal(file.data.repairs.length, 3635);
  assert.equal(file.data.packed_pieces.length, 1248);
  assert.equal(file.data.waste.length, 1248);
  assert.deepEqual(
    file.data.laundry_waste_factors.map((f) => f.laundry_id),
    ["L001", "L002", "L003", "L004"],
  );
});

test("getServiceKpis reads the service performance and adoption KPIs", () => {
  const service = getServiceKpis();
  assert.equal(service.meta.name, "service-kpis");
  assert.equal(service.catalogue.length, 14);
  assert.equal(service.data.activity.length, 1248);
  assert.equal(service.data.site_month.length, 408);
  assert.equal(service.data.cycles.reduce((sum, f) => sum + f.late_cycles, 0), 275);
  const northstar = service.data.turnaround.find(
    (r) => r.scope === "customer" && r.scope_id === "CUST001" && r.product_scope === "all" && r.period === "2025",
  );
  assert.equal(northstar?.cycles, 11353);
  assert.equal(service.data.data_transparency_notes[0].id, "cycles_delivered_in_2026_01");
});

test("getPublicReference reads the generated public reference figures", () => {
  const file = getPublicReference();
  assert.equal(file.meta.name, "public-reference");
  assert.equal(file.catalogue.length, 0);
  assert.equal(file.data.figures.length, 20);
  assert.equal(file.data.gaps.length, 3);
  const energy = file.data.figures.find((f) => f.id === "lindstrom_laundry_energy_per_washed_kg");
  assert.equal(energy?.value, 0.99);
  const homeWater = file.data.figures.find((f) => f.id === "home_washing_water_per_kg");
  assert.deepEqual(homeWater?.value, { low: 13, high: 20 });
  const line = file.data.context_lines.group_emissions_intensity;
  assert.equal(line.view, "Both");
  assert.equal(line.kam_notes.length, 2);
});
