import assert from "node:assert/strict";
import { test } from "node:test";

import { firstScreen, getMasterData, runKpi, signalGroups } from "../data.ts";
import { sitesPage } from "./sites.ts";

test("the Sites page for NorthStar has one row per Site, in master data order", () => {
  const page = sitesPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
  assert.equal(page.rows.length, 24);
  const sites = getMasterData().data.sites.filter((s) => s.customer_id === "CUST001");
  assert.deepEqual(
    page.rows.map((r) => r.site_id),
    sites.map((s) => s.site_id),
  );
});

test("the columns are the priority blocks' KPIs, and each cell is runKpi for that Site and the period", () => {
  const page = sitesPage({ customer_id: "CUST001", period: "2025-H1", view: "KAM" });
  assert.deepEqual(page.kpi_ids, [
    "water_use_allocated",
    "washes_per_garment",
    "turnaround_hours_median",
    "late_service_cycles",
    "service_request_free_site_months",
    "emissions_allocated",
    "energy_saved",
    "avoided_product_co2e_estimated",
  ]);
  for (const row of page.rows) {
    assert.deepEqual(
      row.answers,
      page.kpi_ids.map((kpi_id) => runKpi(kpi_id, { scope: { customer_id: "CUST001", site_id: row.site_id }, period: "2025-H1", view: "KAM" })),
    );
  }
});

test("a changed priority list changes the columns, and a KPI two blocks share is one column", () => {
  const page = sitesPage({ customer_id: "CUST001", period: "2025", view: "KAM", priorities: ["Traceability", "Garment utilisation"] });
  assert.deepEqual(page.kpi_ids, ["scan_coverage", "allocated_garments_with_no_scan_activity", "turnaround_by_stage", "garments_per_wearer"]);
});

test("in the Customer view the Site table holds no Site-grain period comparison and no Withheld cell (ADR 0011)", () => {
  const priorities = ["Improvement", "Traceability", "Water"];
  const customer = sitesPage({ customer_id: "CUST001", period: "2025", view: "Customer", priorities });
  assert.deepEqual(customer.kpi_ids, ["scan_coverage", "allocated_garments_with_no_scan_activity", "water_use_allocated", "washes_per_garment"]);
  const answers = customer.rows.flatMap((r) => r.answers);
  assert.ok(answers.every((a) => !("withheld" in a) && a.detail?.kind !== "period_comparison"));
  // The KAM view keeps the 3 period comparisons at Site grain.
  const kam = sitesPage({ customer_id: "CUST001", period: "2025", view: "KAM", priorities });
  assert.deepEqual(kam.kpi_ids.slice(0, 3), ["improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage"]);
  const cell = kam.rows.find((r) => r.site_id === "S008")!.answers[0];
  assert.ok(!("withheld" in cell) && cell.detail?.kind === "period_comparison" && cell.scope.site_id === "S008");
});

test("each row lists the Site's fired signal results in the view: 18 for NorthStar in the KAM view, 13 in the Customer view", () => {
  for (const [view, total] of [["KAM", 18], ["Customer", 13]] as const) {
    const page = sitesPage({ customer_id: "CUST001", period: "2025", view });
    assert.equal(page.rows.reduce((n, r) => n + r.fired.length, 0), total, view);
    for (const row of page.rows) {
      const atSite = firstScreen({ customer_id: "CUST001", site_id: row.site_id, period: "2025", view }).optimisation_potential;
      assert.equal(row.fired.length, atSite.fired_count, `${view} ${row.site_id}`);
    }
  }
  const customer = sitesPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.ok(customer.rows.flatMap((r) => r.fired).every((f) => f.signal_id !== "service_request_rate_above_peers"));
});

test("a Site's fired signals follow the signal group ranking for the priorities", () => {
  const priorities = ["Circularity", "Water"];
  const ranks = new Map(signalGroups({ customer_id: "CUST001", view: "KAM", priorities }).map((g) => [g.signal_id, g.rank]));
  for (const row of sitesPage({ customer_id: "CUST001", period: "2025", view: "KAM", priorities }).rows) {
    const order = row.fired.map((f) => ranks.get(f.signal_id)!);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), row.site_id);
  }
});

test("each cell carries its bar length: the value over the largest in its column, and none for a period comparison", () => {
  const page = sitesPage({ customer_id: "CUST001", period: "2025", view: "KAM", priorities: ["Improvement", "Water"] });
  const water = page.kpi_ids.indexOf("water_use_allocated");
  const bar = (site_name: string) => page.rows.find((r) => r.site_name === site_name)!.bar_fractions[water];
  // NorthStar Pori uses the most water in 2025, 257,200 l. NorthStar Helsinki uses 243,859 l.
  assert.equal(bar("NorthStar Pori"), 1);
  assert.equal(Math.round(bar("NorthStar Helsinki")! * 1000) / 1000, 0.948);
  for (const row of page.rows) assert.deepEqual(row.bar_fractions.slice(0, 3), [null, null, null], row.site_id);
});
