import assert from "node:assert/strict";
import { test } from "node:test";

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
