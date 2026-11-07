import assert from "node:assert/strict";
import { test } from "node:test";

import { getMasterData, getOperationalCircularityKpis } from "./data.ts";

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
