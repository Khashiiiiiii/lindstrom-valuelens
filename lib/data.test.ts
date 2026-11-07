import assert from "node:assert/strict";
import { test } from "node:test";

import { getMasterData } from "./data.ts";

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
