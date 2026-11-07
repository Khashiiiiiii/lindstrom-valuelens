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
    const { change_badges, on_time_thresholds, ...page } = overviewPage({ customer_id: "CUST001", period: "2025", view });
    assert.deepEqual(page, firstScreen({ customer_id: "CUST001", period: "2025", view }));
    assert.deepEqual(page.priority_ids, ["water", "service_reliability", "emissions"]);
  }
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
