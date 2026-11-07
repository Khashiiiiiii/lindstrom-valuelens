import assert from "node:assert/strict";
import { test } from "node:test";

import { getMasterData, runKpi } from "../data.ts";
import { seriesPage } from "./series.ts";

const months = getMasterData().data.months;

test("a monthly series has 12 points, each equal to runKpi for that month", () => {
  const page = seriesPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.equal(months.length, 12);
  assert.deepEqual(page.months, months);
  for (const { kpi_id, points } of page.series) {
    assert.equal(points.length, 12, kpi_id);
    points.forEach((point, i) => {
      assert.deepEqual(point, runKpi(kpi_id, { scope: { customer_id: "CUST001" }, period: months[i], view: "Customer" }));
    });
  }
});

test("the series cover the KPIs of the common tiles, in tile order", () => {
  const page = seriesPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
  assert.deepEqual(
    page.series.map((s) => s.kpi_id),
    [
      "active_wearers",
      "garments_in_circulation",
      "washed_kg",
      "repairs",
      "on_time_service_cycle_share",
      "service_requests_per_100_wearers",
      "emissions_saved",
      "water_saved",
    ],
  );
});

test("with a Site filter, every point uses the Site scope", () => {
  const page = seriesPage({ customer_id: "CUST001", site_id: "S008", period: "2025", view: "KAM" });
  const washed = page.series.find((s) => s.kpi_id === "washed_kg")!;
  washed.points.forEach((point, i) => {
    assert.deepEqual(point, runKpi("washed_kg", { scope: { customer_id: "CUST001", site_id: "S008" }, period: months[i], view: "KAM" }));
  });
});

test("the selected period's months are the months the chart highlights", () => {
  const months = (period: string) => seriesPage({ customer_id: "CUST001", period, view: "KAM" }).period_months;
  assert.deepEqual(months("2025-H2"), ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"]);
  assert.deepEqual(months("2025-03"), ["2025-03"]);
  assert.equal(months("2025").length, 12);
});
