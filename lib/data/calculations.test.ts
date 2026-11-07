import assert from "node:assert/strict";
import { test } from "node:test";

import type { KpiAnswer, KpiQuery, KpiResult } from "../data.ts";
import { getAccountHealth, getFootprintHandprintKpis, getMasterData, getServiceKpis, listKpis, periodMonths, runKpi } from "../data.ts";

const NORTHSTAR: KpiQuery = { scope: { customer_id: "CUST001" }, period: "2025", view: "KAM" };

function result(answer: KpiAnswer): KpiResult {
  assert.ok(!("withheld" in answer), `${answer.kpi_id} was withheld`);
  return answer;
}

function value(kpi_id: string, query: KpiQuery = NORTHSTAR): number | null {
  return result(runKpi(kpi_id, query)).value;
}

function close(actual: number | null, expected: number, digits = 6) {
  assert.ok(actual !== null, "value is null");
  assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} is not ${expected}`);
}

test("washed_kg sums the Customer's washed kg over 2025", () => {
  const answer = result(runKpi("washed_kg", NORTHSTAR));
  close(answer.value, 502074.7);
  assert.equal(answer.unit, "kg");
  assert.equal(answer.evidence_area, "Sustainability Value");
  assert.equal(answer.data_status, "SYNTHETIC");
  assert.equal(answer.not_evaluated_reason, null);
});

test("footprint KPIs sum water and emissions, with emission source as a breakdown", () => {
  close(value("water_use_allocated"), 3363226.9);
  close(value("emissions_allocated"), 73785.1);
  const bySource = result(runKpi("emissions_allocated", { ...NORTHSTAR, breakdown: "emission_source" }));
  assert.deepEqual(bySource.breakdown?.map((b) => b.key), ["process", "delivery"]);
  close(bySource.breakdown!.reduce((total, b) => total + b.value, 0), 73785.1);
  assert.throws(() => runKpi("water_use_allocated", { ...NORTHSTAR, breakdown: "emission_source" }));
});

test("footprint per active wearer divides by the precomputed per-wearer denominator", () => {
  const denominators = getFootprintHandprintKpis().data.per_wearer_denominators;
  for (const row of denominators) {
    const scope = row.scope === "customer" ? { customer_id: row.scope_id } : { customer_id: row.customer_id, site_id: row.scope_id };
    const total = value("washed_kg", { ...NORTHSTAR, scope, period: row.period });
    const perWearer = result(runKpi("washed_kg", { ...NORTHSTAR, scope, period: row.period, unit: "per_active_wearer" }));
    assert.equal(perWearer.unit, "kg per active wearer");
    close(perWearer.volume, row.active_wearers);
    close(perWearer.value, total! / row.active_wearers, 5);
  }
});

test("handprint against B_LOCAL gives the saved amount and its share of the baseline", () => {
  const water = result(runKpi("water_saved", NORTHSTAR));
  assert.equal(water.baseline_id, "B_LOCAL");
  assert.equal(water.unit, "l");
  close(water.value, 1406482.75);
  assert.equal(water.detail?.kind, "handprint");
  if (water.detail?.kind === "handprint") {
    close(water.detail.share_of_baseline, 0.294878);
    assert.equal(water.detail.baseline_label, "vs outsourced local laundry");
  }
  const emissions = result(runKpi("emissions_saved", NORTHSTAR));
  close(emissions.value, 255073.8285);
  if (emissions.detail?.kind === "handprint") close(emissions.detail.share_of_baseline, 0.775633);
});

test("handprint equals the precomputed handprint row for every scope, period, baseline and factor case", () => {
  const kpis = [
    { id: "water_saved", saved: "water_saved_l", share: "water_saved_share", baseline: "baseline_water_l" },
    { id: "energy_saved", saved: "energy_saved_kwh", share: "energy_saved_share", baseline: "baseline_energy_kwh" },
    { id: "emissions_saved", saved: "emissions_saved_kgco2e", share: "emissions_saved_share", baseline: "baseline_emissions_kgco2e" },
  ] as const;
  const rows = getFootprintHandprintKpis().data.handprint;
  assert.equal(rows.length, 37 * 13 * 4);
  for (const row of rows) {
    const scope = row.scope === "customer" ? { customer_id: row.scope_id } : { customer_id: row.customer_id, site_id: row.scope_id };
    for (const kpi of kpis) {
      const query = { ...NORTHSTAR, scope, period: row.period, baseline_id: row.baseline_id, factor_case: row.factor_case };
      const answer = result(runKpi(kpi.id, query));
      close(answer.value, row[kpi.saved], 5);
      close(answer.volume, row[kpi.baseline], 5);
      assert.ok(answer.detail?.kind === "handprint");
      assert.equal(answer.detail.factor_case, row.factor_case);
      close(answer.detail.share_of_baseline, row[kpi.share]!, 5);
    }
  }
});

test("a handprint low case exists for B_LOCAL only", () => {
  const home = result(runKpi("emissions_saved", { ...NORTHSTAR, baseline_id: "B_HOME", factor_case: "low_case" }));
  assert.equal(home.value, null);
  assert.match(home.not_evaluated_reason ?? "", /low case/);
});

test("repairs and the repair rate per 1,000 packed pieces, with repair type as a breakdown", () => {
  assert.equal(value("repairs"), 15233);
  const rate = result(runKpi("repair_rate", NORTHSTAR));
  assert.equal(rate.unit, "per 1,000 packed pieces");
  close(rate.value, 20.82, 2);
  const byType = result(runKpi("repairs", { ...NORTHSTAR, breakdown: "repair_type" }));
  assert.equal(byType.breakdown?.length, 5);
  assert.equal(byType.breakdown!.reduce((total, b) => total + b.value, 0), 15233);
});

test("replacements postponed and avoided product CO2e follow the postponement ratio", () => {
  assert.equal(value("replacements_postponed_estimated"), 15233);
  const doubled = result(runKpi("replacements_postponed_estimated", { ...NORTHSTAR, postponement_ratio: 2 }));
  assert.equal(doubled.value, 30466);
  assert.ok(doubled.caveats.includes("Postponement ratio used: 2."));
  const avoided = value("avoided_product_co2e_estimated")!;
  close(value("avoided_product_co2e_estimated", { ...NORTHSTAR, postponement_ratio: 0.5 }), avoided / 2);
  assert.throws(() => runKpi("replacements_postponed_estimated", { ...NORTHSTAR, postponement_ratio: -1 }));
});

test("textile waste, its treatment routes and the recycled or reused share", () => {
  close(value("textile_waste_allocated"), 16797.11);
  close(value("recycled_or_reused_share"), 0.7797, 4);
  const routes = result(runKpi("textile_waste_by_treatment_route", NORTHSTAR));
  assert.deepEqual(routes.breakdown?.map((b) => b.key), ["recycling", "reuse", "energy_recovery", "incineration"]);
  const diverted = value("textile_waste_diverted_from_mixed_waste_estimated")!;
  close(diverted, routes.breakdown![0].value + routes.breakdown![1].value, 5);
  close(diverted / value("textile_waste_allocated")!, 0.7797, 4);
});

test("active wearers and garments in circulation are monthly averages", () => {
  close(value("active_wearers"), 9647.3, 1);
  assert.equal(value("garments_in_circulation"), 31670);
  const helsinkiJanuary = { ...NORTHSTAR, scope: { customer_id: "CUST001", site_id: "S001" }, period: "2025-01" };
  close(value("garments_per_wearer", helsinkiJanuary), 3.3, 1);
});

test("on-time service cycles count only cycles delivered in the data months", () => {
  const onTime = result(runKpi("on_time_service_cycle_share", NORTHSTAR));
  close(onTime.value, 0.983264);
  assert.equal(onTime.volume, 11353);
  assert.equal(onTime.unit, "share");
  assert.equal(value("late_service_cycles"), 190);
});

test("scan coverage, service requests and service requests per 100 wearers", () => {
  close(value("scan_coverage"), 0.840065);
  close(value("scan_coverage", { ...NORTHSTAR, period: "2025-H1" }), 0.839395);
  assert.equal(value("service_requests"), 515);
  const perWearer = result(runKpi("service_requests_per_100_wearers", NORTHSTAR));
  close(perWearer.value, 0.444855);
  assert.equal(perWearer.unit, "per 100 wearers per month");
  const noScan = value("allocated_garments_with_no_scan_activity")!;
  close(noScan / value("garments_in_circulation")!, 1 - 0.840065, 4);
});

test("Site-months free of service requests are a share of the Customer's Site-months", () => {
  const free = result(runKpi("service_request_free_site_months", NORTHSTAR));
  const sites = getMasterData().data.sites.filter((s) => s.customer_id === "CUST001").length;
  assert.equal(free.volume, 12 * sites);
  assert.ok(free.value! >= 0 && free.value! <= 1);
});

test("service KPIs equal the account health input values for every rated scope and period", () => {
  const ids = {
    account_health_on_time_service_cycle_share: "on_time_service_cycle_share",
    account_health_service_requests_per_100_wearers_per_month: "service_requests_per_100_wearers",
    account_health_scan_coverage: "scan_coverage",
  } as const;
  for (const rating of getAccountHealth().data.ratings) {
    const scope = rating.scope === "customer" ? { customer_id: rating.scope_id } : { customer_id: rating.customer_id, site_id: rating.scope_id };
    for (const input of rating.inputs) {
      if (input.value === null) continue;
      close(value(ids[input.input_id], { ...NORTHSTAR, scope, period: rating.period }), input.value);
    }
  }
});

test("turnaround statistics come from the precomputed rows, for 2025 and single months only", () => {
  const median = result(runKpi("turnaround_hours_median", NORTHSTAR));
  assert.equal(median.value, 82);
  assert.equal(median.unit, "hours");
  assert.equal(median.volume, 11353);
  assert.equal(value("turnaround_hours_90th_percentile"), 107);
  const h1 = result(runKpi("turnaround_hours_median", { ...NORTHSTAR, period: "2025-H1" }));
  assert.equal(h1.value, null);
  assert.equal(h1.not_evaluated_reason, "Medians are precomputed for all of 2025 and single months only.");
  const stages = result(runKpi("turnaround_by_stage", NORTHSTAR));
  assert.deepEqual(stages.breakdown, [
    { key: "pickup_to_in_laundry", value: 22 },
    { key: "in_laundry_to_out_laundry", value: 36 },
    { key: "out_laundry_to_delivered", value: 24 },
  ]);
  const food = result(runKpi("turnaround_hours_median", { ...NORTHSTAR, scope: { customer_id: "CUST001", preset_id: "food_industry_garments" } }));
  const row = getServiceKpis().data.turnaround.find(
    (r) => r.scope === "customer" && r.scope_id === "CUST001" && r.product_scope_id === "food_industry_garments" && r.period === "2025",
  );
  assert.ok(row);
  assert.equal(food.value, row.median_cycle_hours);
  const safety = result(runKpi("turnaround_hours_median", { ...NORTHSTAR, scope: { customer_id: "CUST001", preset_id: "safety_garments" } }));
  assert.equal(safety.value, null);
  assert.equal(safety.not_evaluated_reason, "No sampled service cycles in the period.");
});

test("account health returns the precomputed rating for 2025 and single months", () => {
  const health = result(runKpi("account_health", NORTHSTAR));
  assert.equal(health.value, null);
  assert.equal(health.unit, "rating");
  assert.ok(health.detail?.kind === "account_health");
  assert.equal(health.detail.rating.rating, "green");
  assert.equal(health.detail.rating.based_on, "Based on 3 of 3 inputs");
  const apex = result(runKpi("account_health", { ...NORTHSTAR, scope: { customer_id: "CUST002" }, period: "2025-11" }));
  assert.ok(apex.detail?.kind === "account_health");
  assert.equal(apex.detail.rating.rating, "amber");
  const h2 = result(runKpi("account_health", { ...NORTHSTAR, period: "2025-H2" }));
  assert.equal(h2.detail, null);
  assert.match(h2.not_evaluated_reason ?? "", /all of 2025 and single months/);
});

test("account health inputs return the input value, and a Site has no service requests input", () => {
  const scan = result(runKpi("account_health_scan_coverage", NORTHSTAR));
  close(scan.value, 0.840065);
  assert.equal(scan.volume, 31670);
  assert.ok(scan.detail?.kind === "account_health_input");
  assert.equal(scan.detail.input.rating, "green");
  const turku = { ...NORTHSTAR, scope: { customer_id: "CUST001", site_id: "S002" } };
  const requests = result(runKpi("account_health_service_requests_per_100_wearers_per_month", turku));
  assert.equal(requests.value, null);
  assert.match(requests.not_evaluated_reason ?? "", /Customer only/);
});

test("period comparisons return the precomputed H2 against H1 results for 2025 only", () => {
  const northstar = result(runKpi("improvement_on_time_service_cycles", NORTHSTAR));
  assert.ok(northstar.detail?.kind === "period_comparison");
  assert.equal(northstar.detail.comparison.label, "no_clear_change");
  assert.equal(northstar.value, -0.000447);
  assert.equal(northstar.volume, 3402);
  const turku = result(runKpi("improvement_on_time_service_cycles", { ...NORTHSTAR, scope: { customer_id: "CUST001", site_id: "S002" } }));
  assert.ok(turku.detail?.kind === "period_comparison");
  assert.equal(turku.detail.comparison.label, "worse");
  for (const period of ["2025-H2", "2025-07"]) {
    const other = result(runKpi("improvement_scan_coverage", { ...NORTHSTAR, period }));
    assert.equal(other.value, null);
    assert.ok(other.not_evaluated_reason);
  }
  const product = result(runKpi("improvement_service_requests", { ...NORTHSTAR, scope: { customer_id: "CUST001", product_id: "P1001" } }));
  assert.equal(product.value, null);
  assert.ok(product.not_evaluated_reason);
});

test("the Customer view withholds KAM-only entries and Site-grain period comparisons", () => {
  const customerView: KpiQuery = { ...NORTHSTAR, view: "Customer" };
  const turku = { customer_id: "CUST001", site_id: "S002" };
  for (const answer of [
    runKpi("account_health", customerView),
    runKpi("account_health_scan_coverage", customerView),
    runKpi("turnaround_by_stage", customerView),
    runKpi("improvement_on_time_service_cycles", { ...customerView, scope: turku }),
  ]) {
    assert.deepEqual(answer, { kpi_id: answer.kpi_id, withheld: true, reason: "KAM view only" });
  }
  close(value("on_time_service_cycle_share", customerView), 0.983264);
  assert.equal(result(runKpi("improvement_on_time_service_cycles", customerView)).view, "Both");
  assert.equal(value("on_time_service_cycle_share", { ...customerView, scope: turku }) !== null, true);
});

test("runKpi throws on an unknown id, a Site of another Customer and a bad scope or period", () => {
  assert.throws(() => runKpi("no_such_kpi", NORTHSTAR), /Unknown KPI id/);
  assert.throws(() => runKpi("repairs", { ...NORTHSTAR, scope: { customer_id: "CUST002", site_id: "S001" } }), /belongs to CUST001/);
  assert.throws(() => runKpi("account_health", { ...NORTHSTAR, view: "Customer", scope: { customer_id: "CUST002", site_id: "S001" } }));
  assert.throws(() => runKpi("repairs", { ...NORTHSTAR, scope: { customer_id: "CUST999" } }));
  assert.throws(() => runKpi("repairs", { ...NORTHSTAR, scope: { customer_id: "CUST001", product_id: "P1001", preset_id: "safety_garments" } }));
  assert.throws(() => runKpi("repairs", { ...NORTHSTAR, period: "2024" }), /Unknown period/);
  assert.throws(() => runKpi("water_saved", { ...NORTHSTAR, baseline_id: "B_MOON" as "B_LOCAL" }));
});

test("periodMonths covers the year, its halves and single months", () => {
  assert.equal(periodMonths("2025").length, 12);
  assert.deepEqual(periodMonths("2025-H2"), ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"]);
  assert.deepEqual(periodMonths("2025-03"), ["2025-03"]);
  assert.throws(() => periodMonths("2026-01"));
});

test("listKpis lists every catalogue entry callable in the view", () => {
  const kam = listKpis("KAM");
  assert.equal(kam.length, 14 + 8 + 7 + 4 + 3);
  const customer = listKpis("Customer");
  assert.deepEqual(
    kam.filter((k) => !customer.some((c) => c.id === k.id)).map((k) => k.id),
    [
      "turnaround_by_stage",
      "account_health",
      "account_health_on_time_service_cycle_share",
      "account_health_service_requests_per_100_wearers_per_month",
      "account_health_scan_coverage",
    ],
  );
  const water = kam.find((k) => k.id === "water_saved");
  assert.deepEqual(water, {
    id: "water_saved",
    name: "Water saved",
    evidence_area: "Sustainability Value",
    grain: "Customer, Site, product, month, baseline",
    view: "Both",
    parameters: ["baseline_id", "factor_case"],
  });
  for (const kpi of kam) {
    assert.doesNotThrow(() => runKpi(kpi.id, NORTHSTAR), kpi.id);
  }
});

test("a bad unit or a breakdown the KPI does not offer throws", () => {
  assert.throws(() => runKpi("washed_kg", { ...NORTHSTAR, unit: "per_kg" as "total" }), /unit/);
  assert.throws(() => runKpi("water_saved", { ...NORTHSTAR, breakdown: "repair_type" }), /breakdown/);
});

test("an account health rating that is not rated gives its reason", () => {
  const unrated = getAccountHealth().data.ratings.find((r) => r.rating === "not_rated");
  assert.ok(unrated);
  const scope = unrated.scope === "customer" ? { customer_id: unrated.scope_id } : { customer_id: unrated.customer_id, site_id: unrated.scope_id };
  const health = result(runKpi("account_health", { ...NORTHSTAR, scope, period: unrated.period }));
  assert.equal(health.not_evaluated_reason, unrated.reason);
});

test("the Customer view withholds a KAM-only entry before reading its parameters", () => {
  const answer = runKpi("turnaround_by_stage", { ...NORTHSTAR, view: "Customer", breakdown: "repair_type" });
  assert.ok("withheld" in answer);
});

test("textile waste by treatment route says why its total can differ from textile waste (allocated)", () => {
  const routes = result(runKpi("textile_waste_by_treatment_route", NORTHSTAR));
  assert.ok(routes.caveats.some((c) => c.includes("Textile waste (allocated)")));
  assert.deepEqual(listKpis("KAM").find((k) => k.id === "textile_waste_by_treatment_route")?.parameters, ["breakdown"]);
});
