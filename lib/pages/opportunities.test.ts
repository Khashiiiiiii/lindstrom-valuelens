import assert from "node:assert/strict";
import { test } from "node:test";

import { firstScreen, getViewsAndReview } from "../data.ts";
import { opportunitiesPage } from "./opportunities.ts";

const VIEWS = ["KAM", "Customer"] as const;
const stored = getViewsAndReview().data.defaults_by_customer.find((c) => c.customer_id === "CUST001")!;

test("the Opportunities page for NorthStar lists the stored signal groups in rank order, then the proposed next steps", () => {
  for (const view of VIEWS) {
    const page = opportunitiesPage({ customer_id: "CUST001", period: "2025", view });
    assert.deepEqual(page.signal_groups, stored.views[view].signal_groups, view);
    assert.deepEqual(page.proposed_next_steps, stored.views[view].proposed_next_steps, view);
  }
  const customer = opportunitiesPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.deepEqual(
    customer.signal_groups.map((g) => [g.rank, g.signal_id, g.lever_owner]),
    [
      [1, "washes_per_garment_above_peers", "Customer"],
      [2, "late_service_cycles_above_peers", "Lindström"],
      [3, "garment_allocation_above_peers", "Joint"],
      [4, "allocated_garments_with_no_scan_activity_above_peers", "Joint"],
      [5, "repair_rate_above_peers", "Joint"],
    ],
  );
  assert.ok(customer.proposed_next_steps.every((s) => s.status === "proposed"));
});

test("the fired count is the Optimisation potential count: 18 for NorthStar in the KAM view, 13 in the Customer view", () => {
  for (const [view, fired] of [["KAM", 18], ["Customer", 13]] as const) {
    for (const period of ["2025", "2025-H1", "2025-03"] as const) {
      const request = { customer_id: "CUST001", period, view };
      assert.equal(opportunitiesPage(request).fired_count, fired, `${view} ${period}`);
      assert.equal(opportunitiesPage(request).fired_count, firstScreen(request).optimisation_potential.fired_count);
    }
  }
});

test("with a Site filter, the page keeps that Site's fired results, ranked by its gaps, and the next steps are its top groups", () => {
  // Fired results per Site in opportunity-signals.json. Signal 4 is KAM view only (ADR 0011).
  const expected = {
    S008: { KAM: ["washes_per_garment_above_peers", "late_service_cycles_above_peers"] },
    S018: {
      // Neither matches a default priority. The service request gap of 69% is larger than the scan coverage gap of 21%.
      KAM: ["service_request_rate_above_peers", "allocated_garments_with_no_scan_activity_above_peers"],
      Customer: ["allocated_garments_with_no_scan_activity_above_peers"],
    },
  };
  for (const [site_id, byView] of Object.entries(expected)) {
    for (const [view, signals] of Object.entries(byView) as [(typeof VIEWS)[number], string[]][]) {
      const request = { customer_id: "CUST001", site_id, period: "2025", view } as const;
      const page = opportunitiesPage(request);
      assert.deepEqual(page.signal_groups.map((g) => [g.rank, g.signal_id]), signals.map((id, i) => [i + 1, id]), `${site_id} ${view}`);
      assert.ok(page.signal_groups.every((g) => g.results.every((r) => r.site_id === site_id)));
      assert.deepEqual(page.proposed_next_steps.map((s) => [s.position, s.signal_id]), signals.map((id, i) => [i + 1, id]));
      assert.ok(page.proposed_next_steps.every((s) => s.results.every((r) => r.site_id === site_id)));
      assert.equal(page.fired_count, signals.length);
      assert.equal(page.fired_count, firstScreen(request).optimisation_potential.fired_count);
    }
  }
  assert.throws(() => opportunitiesPage({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "KAM" }));
});
