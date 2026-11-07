import assert from "node:assert/strict";
import { test } from "node:test";

import type { DataPage, DataPageItem } from "./data.ts";
import { dataPage } from "./data.ts";

const CUSTOMER_ITEMS = ["baseline_used", "assumption_list", "data_status_legend", "data_gaps"];

test("the Customer view shows only the Customer version's items, in order", () => {
  const page = dataPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.deepEqual(
    page.items.map((i) => i.id),
    CUSTOMER_ITEMS,
  );
});

test("the KAM view adds the laundry factors, the public figure comparison, the KAM notes and the thresholds and guards", () => {
  const page = dataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
  assert.deepEqual(
    page.items.map((i) => i.id),
    [
      ...CUSTOMER_ITEMS,
      "laundry_water_and_energy_factors",
      "laundry_waste_factors",
      "process_co2e_per_kwh",
      "baseline_factors_and_dataset_actuals_against_public_figures",
      "group_emissions_intensity_notes",
      "january_2026_cycles",
      "thresholds_and_guards",
    ],
  );
  // The Customer items show in both views. The rest are KAM view only.
  assert.deepEqual(
    page.items.map((i) => i.view),
    [...CUSTOMER_ITEMS.map(() => "Both"), ...Array(7).fill("KAM")],
  );
  assert.ok(dataPage({ customer_id: "CUST001", period: "2025", view: "Customer" }).items.every((i) => i.view === "Both"));
});

/** The page's item of that id, narrowed to its kind. */
function item<K extends DataPageItem["id"]>(page: DataPage, id: K): Extract<DataPageItem, { id: K }> {
  const found = page.items.find((i) => i.id === id);
  assert.ok(found, id);
  return found as Extract<DataPageItem, { id: K }>;
}

const customer = () => dataPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
const kam = () => dataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });

test("Baseline used names the 3 washing alternatives with their factors, outsourced local laundry by default", () => {
  const baseline = item(customer(), "baseline_used");
  assert.equal(baseline.default_baseline_id, "B_LOCAL");
  assert.deepEqual(
    baseline.baselines.map((b) => [b.baseline_id, b.baseline_name, b.selection_status]),
    [
      ["B_LOCAL", "Outsourced local laundry", "DEFAULT"],
      ["B_HOME", "Home washing", "OPTION"],
      ["B_INHOUSE", "In-house customer laundry", "OPTION"],
    ],
  );
  const local = baseline.baselines[0];
  assert.deepEqual(
    [local.water_l_per_kg, local.energy_kwh_per_kg, local.process_kgco2e_per_kg, local.delivery_kgco2e_per_kg, local.mixed_waste_share],
    [9.5, 1.05, 0.62, 0.035, 1],
  );
  assert.equal(local.assumption_note, "No systematic repair; textile waste assumed mixed waste. Values illustrative.");
});

test("the Assumption list holds A001 to A005 with their value or rule, and leaves out A006 to A008", () => {
  const list = item(customer(), "assumption_list");
  assert.deepEqual(
    list.assumptions.map((a) => [a.assumption_id, a.assumption]),
    [
      ["A001", "Default comparison baseline"],
      ["A002", "Repair handprint"],
      ["A003", "Waste attribution"],
      ["A004", "Waste baseline"],
      ["A005", "Product footprint"],
    ],
  );
  const repair = list.assumptions[1];
  assert.deepEqual(
    [repair.value_or_rule, repair.confidence, repair.treatment],
    ["1 completed repair postpones 1 replacement event", "Low-Medium", "Sensitivity-test"],
  );
});

test("the Data status legend explains all 6 data statuses", () => {
  const legend = item(customer(), "data_status_legend");
  assert.deepEqual(
    legend.entries.map((e) => e.data_status),
    ["SYNTHETIC", "SYNTHETIC_ESTIMATE", "SYNTHETIC_STRUCTURALLY_REPRESENTATIVE", "ALLOCATED_ESTIMATE_SYNTHETIC", "PUBLIC_REFERENCE", "TEAM_ASSUMPTION"],
  );
  assert.equal(legend.entries[5].text, "A threshold or factor the team set where no source gives one. It can be changed.");
});

test("Data gaps lists the 6 things the data does not hold, in the Customer wording", () => {
  const gaps = item(customer(), "data_gaps");
  assert.deepEqual(
    gaps.entries.map((e) => [e.id, e.name]),
    [
      ["customer_experience", "Customer Experience"],
      ["contract_slas", "Contract SLAs"],
      ["cost", "Cost"],
      ["hygiene", "Hygiene"],
      ["safety", "Safety"],
      ["compliance", "Compliance"],
    ],
  );
  assert.equal(gaps.entries[0].text, "The workbook holds no CSAT or NPS survey results.");
  assert.ok(gaps.entries.every((e) => !("refs" in e)));
});

test("the laundry water and energy factors give each of the 4 laundries its 12 months", () => {
  const factors = item(kam(), "laundry_water_and_energy_factors");
  assert.deepEqual(
    factors.laundries.map((l) => [l.laundry_id, l.laundry_name, l.country, l.months.length]),
    [
      ["L001", "Aurora Helsinki WWS", "Finland", 12],
      ["L002", "Aurora Turku WWS", "Finland", 12],
      ["L003", "Nordic Malmö WWS", "Sweden", 12],
      ["L004", "Vistula Warsaw WWS", "Poland", 12],
    ],
  );
  assert.deepEqual(factors.laundries[0].months[0], { month: "2025-01", fresh_water_l_per_kg: 4.95, energy_kwh_per_kg: 0.74 });
});

test("each laundry has one waste factor and one process CO2e per kWh, set by its country grid", () => {
  const page = kam();
  assert.deepEqual(
    item(page, "laundry_waste_factors").laundries.map((l) => [l.laundry_name, l.waste_g_per_washed_kg]),
    [
      ["Aurora Helsinki WWS", 26.3],
      ["Aurora Turku WWS", 42.44],
      ["Nordic Malmö WWS", 42.24],
      ["Vistula Warsaw WWS", 40.98],
    ],
  );
  assert.deepEqual(
    item(page, "process_co2e_per_kwh").laundries.map((l) => [l.country, l.process_kgco2e_per_kwh]),
    [
      ["Finland", 0.09],
      ["Finland", 0.09],
      ["Sweden", 0.05],
      ["Poland", 0.42],
    ],
  );
});

test("the public figure comparison sets 6 public figures and the B_LOCAL low case against the baseline factors", () => {
  const comparison = item(kam(), "baseline_factors_and_dataset_actuals_against_public_figures");
  assert.deepEqual(
    comparison.figures.map((f) => [f.id, f.value, f.unit]),
    [
      ["lindstrom_laundry_energy_per_washed_kg", 0.99, "kWh/kg"],
      ["lindstrom_water_per_washed_kg_group", 6.82, "L/kg"],
      ["lindstrom_water_per_washed_kg_workwear", 12.5, "L/kg"],
      ["lindstrom_emissions_per_washed_kg_scope_1_2", 0.19, "kgCO2e/kg"],
      ["lindstrom_emissions_per_washed_kg_scope_1_2_3", 0.71, "kgCO2e/kg"],
      ["large_operator_emissions_per_kg_scope_1_2", { low: 0.19, high: 0.3 }, "kgCO2e/kg"],
    ],
  );
  assert.ok(comparison.figures.every((f) => f.data_status === "PUBLIC_REFERENCE"));
  assert.deepEqual(
    comparison.low_cases.map((c) => [c.baseline_id, c.factor, c.value, c.data_status]),
    [["B_LOCAL", "process_kgco2e_per_kg", 0.3, "TEAM_ASSUMPTION"]],
  );
  assert.deepEqual(
    comparison.baselines.map((b) => [b.baseline_id, b.water_l_per_kg, b.energy_kwh_per_kg, b.process_kgco2e_per_kg]),
    [
      ["B_LOCAL", 9.5, 1.05, 0.62],
      ["B_HOME", 20, 1.18, 0.78],
      ["B_INHOUSE", 12.5, 1.12, 0.68],
    ],
  );
});

test("the KAM notes give the group emissions intensity notes and the January 2026 cycles note", () => {
  const page = kam();
  const intensity = item(page, "group_emissions_intensity_notes");
  assert.equal(
    intensity.context_line,
    "Lindström Group 0.28 kg CO2e per euro of turnover, 13% below the average of Elis, Cintas, Salesianer and Johnson Service Group.",
  );
  assert.deepEqual(
    intensity.notes.map((n) => n.text),
    [
      "The 13% holds only when Lindström is left out of the average. It is 10.8% when Lindström is included.",
      "The Johnson Service Group figure of 0.38 does not match JSG's 2024 report, which gives about 0.31 per GBP.",
    ],
  );
  assert.deepEqual(
    item(page, "january_2026_cycles").notes.map((n) => n.text),
    ["23 sampled service cycles were delivered in 2026-01. They are kept in a 2026-01 bucket and fall outside every 2025 period."],
  );
});

test("Thresholds and guards lists all 13 TEAM_ASSUMPTION entries with their values and rationale", () => {
  const thresholds = item(kam(), "thresholds_and_guards");
  assert.deepEqual(
    thresholds.entries.map((e) => [e.file, e.catalogue_id]),
    [
      ["account-health", "account_health"],
      ["account-health", "account_health_on_time_service_cycle_share"],
      ["account-health", "account_health_service_requests_per_100_wearers_per_month"],
      ["account-health", "account_health_scan_coverage"],
      ["period-comparisons", "improvement_on_time_service_cycles"],
      ["period-comparisons", "improvement_service_requests"],
      ["period-comparisons", "improvement_scan_coverage"],
      ["opportunity-signals", "garment_allocation_above_peers"],
      ["opportunity-signals", "allocated_garments_with_no_scan_activity_above_peers"],
      ["opportunity-signals", "washes_per_garment_above_peers"],
      ["opportunity-signals", "service_request_rate_above_peers"],
      ["opportunity-signals", "late_service_cycles_above_peers"],
      ["opportunity-signals", "repair_rate_above_peers"],
    ],
  );
  assert.ok(thresholds.entries.every((e) => e.data_status === "TEAM_ASSUMPTION"));
  const entry = (id: string) => thresholds.entries.find((e) => e.catalogue_id === id)!;
  // Account health itself is the worst of its inputs and has no threshold of its own.
  assert.deepEqual(entry("account_health").parameters, []);
  const coverage = entry("account_health_scan_coverage");
  assert.equal(coverage.name, "Account health scan coverage");
  assert.deepEqual(coverage.parameters, [
    { parameter: "green_threshold", value: 0.8 },
    { parameter: "amber_threshold", value: 0.7 },
    { parameter: "minimum_volume", value: 500 },
  ]);
  assert.equal(coverage.rationale, "No public benchmark exists. Set at about 2 times the 2025 synthetic spread. Replace with the contract SLA in production.");
  assert.deepEqual(entry("improvement_on_time_service_cycles").parameters, [
    { parameter: "test_level", value: 0.95 },
    { parameter: "minimum_sampled_cycles", value: 100 },
  ]);
  assert.deepEqual(entry("improvement_scan_coverage").parameters, [
    { parameter: "scan_coverage_threshold_points", value: 5 },
    { parameter: "minimum_allocated_pieces_monthly_average", value: 500 },
  ]);
  assert.deepEqual(entry("late_service_cycles_above_peers").parameters, [
    { parameter: "threshold", value: 0.5 },
    { parameter: "minimum_late_cycles", value: 10 },
    { parameter: "minimum_sampled_cycles", value: 100 },
    { parameter: "minimum_peers", value: 3 },
  ]);
});
