import assert from "node:assert/strict";
import { test } from "node:test";

import { drawKey } from "./draw-key.ts";

test("a chart keeps its key when a new reply holds the same values, so it does not redraw", () => {
  assert.equal(drawKey([0.91, null, 0.88], "share"), drawKey([0.91, null, 0.88], "share"));
});

test("a chart gets a new key when a value or the unit changes, so it draws in again", () => {
  const before = drawKey([0.91, null, 0.88], "share");
  assert.notEqual(drawKey([0.91, 0.9, 0.88], "share"), before);
  assert.notEqual(drawKey([0.91, null, 0.88], "kg"), before);
});
