import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataPage } from "../../lib/pages/metadata.ts";
import { overviewPage } from "../../lib/pages/overview.ts";
import type { PageState } from "../page-state.ts";
import { priorityEditor } from "./priority-editor.ts";

const meta = metadataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
// NorthStar's stated priorities in customer-priorities.json.
const northstar: Pick<PageState, "customer_id" | "priorities"> = {
  customer_id: "CUST001",
  priorities: ["water", "service_reliability", "emissions"],
};

test("the chosen priorities show in order, and the first 3 make the priority blocks", () => {
  const editor = priorityEditor("en", meta, { ...northstar, priorities: [...northstar.priorities, "circularity"] });
  assert.deepEqual(
    editor.rows.map((r) => [r.position, r.name, r.in_blocks]),
    [
      [1, "Water", true],
      [2, "Service reliability", true],
      [3, "Emissions", true],
      [4, "Circularity", false],
    ],
  );
});

test("moving a priority into the first 3 changes the Overview priority blocks", () => {
  const editor = priorityEditor("en", meta, { ...northstar, priorities: [...northstar.priorities, "circularity"] });
  const circularity = editor.rows[3];
  assert.equal(circularity.down, null);
  assert.deepEqual(circularity.up, ["water", "service_reliability", "circularity", "emissions"]);
  assert.equal(editor.rows[0].up, null);
  assert.deepEqual(editor.rows[0].down, ["service_reliability", "water", "emissions", "circularity"]);
  const overview = overviewPage({ customer_id: "CUST001", period: "2025", view: "Customer", priorities: circularity.up! });
  assert.deepEqual(
    overview.priority_blocks.map((b) => b.priority_id),
    ["water", "service_reliability", "circularity"],
  );
});

test("remove drops a priority, and the add chips offer only the priorities not chosen", () => {
  const editor = priorityEditor("sv", meta, northstar);
  assert.deepEqual(editor.rows[1].remove, ["water", "emissions"]);
  // The 4 priorities NorthStar has not chosen, in catalogue order, named in Swedish.
  assert.deepEqual(
    editor.chips.map((c) => [c.id, c.name]),
    [
      ["circularity", "Cirkularitet"],
      ["garment_utilisation", "Plaggutnyttjande"],
      ["traceability", "Spårbarhet"],
      ["improvement", "Förbättring"],
    ],
  );
  assert.deepEqual(editor.chips[2].add, ["water", "service_reliability", "emissions", "traceability"]);
  const removed = priorityEditor("en", meta, { ...northstar, priorities: editor.rows[1].remove });
  assert.deepEqual(removed.chips.map((c) => c.id), [
    "circularity",
    "service_reliability",
    "garment_utilisation",
    "traceability",
    "improvement",
  ]);
});

test("Reset to default restores the Customer's default priorities", () => {
  const changed = priorityEditor("en", meta, { customer_id: "CUST001", priorities: ["circularity"] });
  assert.deepEqual(changed.reset, ["water", "service_reliability", "emissions"]);
  // Apex Facility Services' default priorities in customer-priorities.json.
  const apex = priorityEditor("en", meta, { customer_id: "CUST002", priorities: [] });
  assert.deepEqual(apex.reset, ["garment_utilisation", "circularity"]);
});
