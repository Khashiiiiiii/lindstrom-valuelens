import assert from "node:assert/strict";
import { test } from "node:test";

import type { KpiAnswer } from "../data.ts";
import { firstScreen, getAccountHealth, getMasterData, getPeriodComparisons } from "../data.ts";
import type { OverviewPage } from "./overview.ts";
import { overviewPage } from "./overview.ts";

/** The comparison a badge's answer holds, or null for a Withheld or not evaluated answer. */
const comparison = (answer: KpiAnswer) =>
  !("withheld" in answer) && answer.detail?.kind === "period_comparison" ? answer.detail.comparison : null;
const badge = (page: OverviewPage, tile_id: string) => page.change_badges.find((b) => b.tile_id === tile_id)!.comparison;

test("the Overview for NorthStar, 2025 and default priorities holds firstScreen", () => {
  for (const view of ["KAM", "Customer"] as const) {
    const { change_badges, on_time_thresholds, block_signal_groups, kam_charts, ...page } = overviewPage({ customer_id: "CUST001", period: "2025", view });
    assert.deepEqual(page, firstScreen({ customer_id: "CUST001", period: "2025", view }));
    assert.deepEqual(page.priority_ids, ["water", "service_reliability", "emissions"]);
    assert.deepEqual(
      page.priority_blocks.map((b) => [b.position, b.priority_id]),
      [
        [1, "water"],
        [2, "service_reliability"],
        [3, "emissions"],
      ],
    );
  }
});

test("a changed priority list in the request changes the blocks and their order", () => {
  const page = overviewPage({ customer_id: "CUST001", period: "2025", view: "Customer", priorities: ["Circularity", "Water", "Traceability", "Emissions"] });
  assert.deepEqual(
    page.priority_blocks.map((b) => [b.position, b.priority_id, b.signal_group_signal_id]),
    [
      [1, "circularity", "repair_rate_above_peers"],
      [2, "water", "washes_per_garment_above_peers"],
      [3, "traceability", "allocated_garments_with_no_scan_activity_above_peers"],
    ],
  );
});

test("the Overview carries the signal group each block names, with its lever, owner and the results at the Site filter", () => {
  const page = overviewPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.deepEqual(
    page.block_signal_groups.map((g) => [g.signal_id, g.lever, g.lever_owner, g.results.length]),
    [
      ["washes_per_garment_above_peers", "Review the Site's garment change routine.", "Customer", 4],
      ["late_service_cycles_above_peers", "Investigate the late cycles by stage.", "Lindström", 1],
    ],
  );
  const site = overviewPage({ customer_id: "CUST001", site_id: "S008", period: "2025", view: "Customer" });
  assert.ok(site.block_signal_groups.length > 0);
  for (const group of site.block_signal_groups) assert.deepEqual([...new Set(group.results.map((r) => r.site_id))], ["S008"]);
});

test("the Overview in the Customer view holds no account health and no Withheld tile, for the Customer and each Site", () => {
  const sites = getMasterData().data.sites.filter((s) => s.customer_id === "CUST001");
  assert.equal(sites.length, 24);
  for (const site_id of [undefined, ...sites.map((s) => s.site_id)]) {
    const page = overviewPage({ customer_id: "CUST001", site_id, period: "2025", view: "Customer" });
    assert.equal(page.kam_additions, null);
    assert.equal(page.tiles.length, 9);
    const withheld = page.tiles.flatMap((t) => t.answers).filter((a) => "withheld" in a);
    assert.deepEqual(withheld, [], `Site ${site_id}`);
  }
  assert.ok(overviewPage({ customer_id: "CUST001", period: "2025", view: "KAM" }).kam_additions?.account_health);
});

test("the 2 badges for 2025 match the Customer results in the period comparisons JSON, and no other tile has a badge", () => {
  const stored = getPeriodComparisons().data.results.comparisons.filter((c) => c.customer_id === "CUST001");
  for (const view of ["KAM", "Customer"] as const) {
    const page = overviewPage({ customer_id: "CUST001", period: "2025", view });
    assert.deepEqual(
      page.change_badges.map((b) => [b.tile_id, b.comparison.kpi_id]),
      [
        ["on_time_service_cycle_share", "improvement_on_time_service_cycles"],
        ["service_requests_per_100_wearers", "improvement_service_requests"],
      ],
    );
    for (const { comparison: answer } of page.change_badges) {
      const expected = stored.find((c) => c.comparison_id === answer.kpi_id)!.customer_result;
      assert.deepEqual(comparison(answer), expected, `${view} ${answer.kpi_id}`);
    }
  }
  // NorthStar's 2025 labels as the JSON holds them.
  const page = overviewPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.equal(comparison(badge(page, "on_time_service_cycle_share"))?.label, "no_clear_change");
  assert.equal(comparison(badge(page, "service_requests_per_100_wearers"))?.label, "no_clear_change");
});

test("H2 compares H2 against H1, and a month compares with the month before", () => {
  const sides = (period: string) => {
    const c = comparison(badge(overviewPage({ customer_id: "CUST001", period, view: "KAM" }), "on_time_service_cycle_share"));
    return [c?.period.name, c?.comparison_period.name];
  };
  assert.deepEqual(sides("2025-H2"), ["H2 2025", "H1 2025"]);
  assert.deepEqual(sides("2025-03"), ["March 2025", "February 2025"]);
  assert.deepEqual(sides("2025-12"), ["December 2025", "November 2025"]);
});

test("January and H1 have no period before them in the data, so their badges are not evaluated", () => {
  for (const period of ["2025-01", "2025-H1"]) {
    const answer = badge(overviewPage({ customer_id: "CUST001", period, view: "KAM" }), "service_requests_per_100_wearers");
    assert.ok(!("withheld" in answer));
    assert.equal(answer.value, null);
    assert.equal(answer.not_evaluated_reason, "not available: the data holds 2025 only");
  }
});

test("a Site badge is withheld in the Customer view (ADR 0011)", () => {
  const page = overviewPage({ customer_id: "CUST001", site_id: "S008", period: "2025", view: "Customer" });
  assert.ok(page.change_badges.every((b) => "withheld" in b.comparison));
  const kam = overviewPage({ customer_id: "CUST001", site_id: "S008", period: "2025", view: "KAM" });
  assert.equal(comparison(badge(kam, "on_time_service_cycle_share"))?.scope_id, "S008");
});

test("the gauge thresholds are the account health on-time thresholds in the KAM view only", () => {
  const health = getAccountHealth().data;
  const defaults = health.defaults.account_health_on_time_service_cycle_share;
  const rated = health.ratings.find((r) => r.scope === "customer" && r.scope_id === "CUST001" && r.period === "2025")!;
  const used = rated.inputs.find((i) => i.input_id === "account_health_on_time_service_cycle_share")!.thresholds_used;
  for (const period of ["2025", "2025-H1", "2025-05"]) {
    const kam = overviewPage({ customer_id: "CUST001", period, view: "KAM" });
    assert.deepEqual(kam.on_time_thresholds, defaults);
    assert.deepEqual(kam.on_time_thresholds, used);
    assert.equal(overviewPage({ customer_id: "CUST001", period, view: "Customer" }).on_time_thresholds, null);
  }
});

test("the Overview in the KAM view adds the waste route split for the period and turnaround by stage for each month", () => {
  for (const site_id of [undefined, "S008"]) {
    const page = overviewPage({ customer_id: "CUST001", site_id, period: "2025-H1", view: "KAM" });
    assert.ok(page.kam_charts);
    const waste = page.kam_charts.textile_waste_by_treatment_route;
    assert.ok(!("withheld" in waste));
    assert.equal(waste.period, "2025-H1");
    assert.deepEqual(waste.scope, site_id ? { customer_id: "CUST001", site_id } : { customer_id: "CUST001" });
    assert.deepEqual(waste.breakdown?.map((b) => b.key), ["recycling", "reuse", "energy_recovery", "incineration"]);
    const stages = page.kam_charts.turnaround_by_stage;
    assert.deepEqual(stages.map((s) => s.month), getMasterData().data.months);
    for (const { month, answer } of stages) {
      assert.ok(!("withheld" in answer));
      assert.equal(answer.period, month);
      assert.deepEqual(answer.scope, waste.scope);
      assert.deepEqual(answer.breakdown?.map((b) => b.key), ["pickup_to_in_laundry", "in_laundry_to_out_laundry", "out_laundry_to_delivered"]);
    }
  }
  const h1 = overviewPage({ customer_id: "CUST001", period: "2025-H1", view: "KAM" }).kam_charts!.turnaround_by_stage;
  assert.deepEqual(h1.filter((s) => s.in_period).map((s) => s.month), ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"]);
  const march = overviewPage({ customer_id: "CUST001", period: "2025-03", view: "KAM" }).kam_charts!.turnaround_by_stage;
  assert.deepEqual(march.filter((s) => s.in_period).map((s) => s.month), ["2025-03"]);
  const whole = overviewPage({ customer_id: "CUST001", period: "2025", view: "KAM" }).kam_charts!;
  assert.ok(whole.turnaround_by_stage.every((s) => s.in_period));
  // NorthStar's 2025 route kg in operational-circularity-kpis.json, rounded.
  const waste = whole.textile_waste_by_treatment_route;
  assert.deepEqual("withheld" in waste ? null : waste.breakdown?.map((b) => Math.round(b.value)), [12278, 819, 3243, 455]);
});

test("the Customer view holds no account health, no dashboard_emphasis and no turnaround by stage", () => {
  const all = ["Water", "Service reliability", "Traceability", "Emissions", "Circularity", "Garment utilisation"];
  for (const priorities of [undefined, all]) {
    const page = overviewPage({ customer_id: "CUST001", period: "2025", view: "Customer", priorities });
    assert.equal(page.kam_additions, null);
    assert.equal(page.kam_charts, null);
    // skipped_kpis names the KAM-only KPIs a block leaves out, so it holds their ids and no figure.
    const json = JSON.stringify({ ...page, priority_blocks: page.priority_blocks.map(({ skipped_kpis, ...b }) => b) });
    for (const banned of ["account_health", "dashboard_emphasis", "turnaround_by_stage"]) {
      assert.ok(!json.includes(banned), `${banned} with priorities ${priorities}`);
    }
  }
});
