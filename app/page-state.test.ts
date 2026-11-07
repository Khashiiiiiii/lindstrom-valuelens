import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssistantAnswer } from "../lib/assistant/contract.ts";
import { SUGGESTED_PROMPTS } from "../lib/assistant/contract.ts";
import { stubAnswer } from "../lib/assistant/stub.ts";
import { metadataPage } from "../lib/pages/metadata.ts";
import { overviewPage } from "../lib/pages/overview.ts";
import { pageRequest, pageState } from "./page-state.ts";

const { customers } = metadataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
const northstar = customers.find((c) => c.customer_id === "CUST001")!;
const apex = customers.find((c) => c.customer_id === "CUST002")!;

test("the first Customer starts with its default priorities, all of 2025, the KAM view and no Site filter", () => {
  assert.deepEqual(pageState(null, { type: "customer", customer: northstar }), {
    customer_id: "CUST001",
    site_id: null,
    period: "2025",
    view: "KAM",
    priorities: ["water", "service_reliability", "emissions"],
    undo: null,
  });
});

test("switching Customer loads its default priorities and clears the Site filter, and keeps the period and view", () => {
  let state = pageState(null, { type: "customer", customer: northstar });
  state = pageState(state, { type: "site", site_id: "S008" });
  state = pageState(state, { type: "priorities", priorities: ["circularity", "water"] });
  state = pageState(state, { type: "period", period: "2025-H2" });
  state = pageState(state, { type: "view", view: "Customer" });
  assert.deepEqual(pageState(state, { type: "customer", customer: apex }), {
    customer_id: "CUST002",
    site_id: null,
    period: "2025-H2",
    view: "Customer",
    priorities: ["garment_utilisation", "circularity"],
    undo: null,
  });
});

test("switching view keeps the priorities and the Site filter", () => {
  let state = pageState(null, { type: "customer", customer: northstar });
  state = pageState(state, { type: "site", site_id: "S008" });
  state = pageState(state, { type: "priorities", priorities: ["circularity", "water"] });
  const customerView = pageState(state, { type: "view", view: "Customer" });
  assert.deepEqual(customerView, { ...state, view: "Customer" });
  assert.deepEqual(pageState(customerView, { type: "view", view: "KAM" }).priorities, ["circularity", "water"]);
});

test("the page request carries the state, with no site_id when no Site filter is on", () => {
  const state = pageState(null, { type: "customer", customer: northstar });
  assert.deepEqual(pageRequest(state), {
    customer_id: "CUST001",
    period: "2025",
    view: "KAM",
    priorities: ["water", "service_reliability", "emissions"],
  });
  assert.equal(pageRequest(pageState(state, { type: "site", site_id: "S008" })).site_id, "S008");
});

test("clearing the Site chip returns the page request to the Customer scope", () => {
  const customer = pageState(null, { type: "customer", customer: northstar });
  const filtered = pageState(customer, { type: "site", site_id: "S008" });
  const cleared = pageState(filtered, { type: "site", site_id: null });
  assert.deepEqual(cleared, customer);
  assert.deepEqual(pageRequest(cleared), pageRequest(customer));
  assert.ok(!("site_id" in pageRequest(cleared)));
  const overview = overviewPage(pageRequest(cleared));
  assert.equal(overview.site_count, 24);
  assert.equal(overview.optimisation_potential.fired_count, 18);
});

test("an assistant priority change applies at once, and Undo restores the list from before the change", () => {
  const before = pageState(pageState(null, { type: "customer", customer: northstar }), { type: "site", site_id: "S008" });
  const changed = pageState(before, { type: "assistant priorities", priorities: ["emissions", "water"] });
  assert.deepEqual(changed.priorities, ["emissions", "water"]);
  assert.deepEqual(changed.undo, ["water", "service_reliability", "emissions"]);
  assert.deepEqual(pageState(changed, { type: "undo" }), before);
  assert.equal(pageState(before, { type: "undo" }), before);
});

test("a second assistant change undoes to the list before it, and a KAM edit or Customer switch drops the Undo", () => {
  let state = pageState(null, { type: "customer", customer: northstar });
  state = pageState(state, { type: "assistant priorities", priorities: ["emissions"] });
  state = pageState(state, { type: "assistant priorities", priorities: ["circularity"] });
  assert.deepEqual(state.undo, ["emissions"]);
  assert.equal(pageState(state, { type: "priorities", priorities: ["water"] }).undo, null);
  assert.equal(pageState(state, { type: "customer", customer: apex }).undo, null);
});

test("a period, Site or view switch keeps the Undo", () => {
  let state = pageState(null, { type: "customer", customer: northstar });
  state = pageState(state, { type: "assistant priorities", priorities: ["emissions"] });
  for (const action of [
    { type: "period", period: "2025-H1" },
    { type: "site", site_id: "S008" },
    { type: "view", view: "Customer" },
  ] as const) {
    assert.deepEqual(pageState(state, action).undo, ["water", "service_reliability", "emissions"], action.type);
  }
});

test("the stub's priority change reorders the Overview priority blocks, and Undo restores them", () => {
  const state = pageState(null, { type: "customer", customer: northstar });
  const blocks = (s: typeof state) => overviewPage(pageRequest(s)).priority_blocks.map((b) => b.priority_id);
  assert.deepEqual(blocks(state), ["water", "service_reliability", "emissions"]);
  const reply = stubAnswer({ ...pageRequest(state), prompt: SUGGESTED_PROMPTS[1] }).body as AssistantAnswer;
  const changed = pageState(state, { type: "assistant priorities", priorities: reply.priority_change!.priorities });
  assert.deepEqual(blocks(changed), ["water", "emissions", "service_reliability"]);
  assert.deepEqual(blocks(pageState(changed, { type: "undo" })), ["water", "service_reliability", "emissions"]);
});
