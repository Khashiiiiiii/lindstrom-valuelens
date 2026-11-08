import assert from "node:assert/strict";
import { test } from "node:test";

import { seriesPage } from "../../lib/pages/series.ts";
import { trendOptions } from "./chart-series.ts";

const series = seriesPage({ customer_id: "CUST001", period: "2025", view: "KAM" }).series;

test("the trend options name each KPI in the language, and a share's points have no unit", () => {
  const options = trendOptions("fi", series);
  assert.deepEqual(options.slice(0, 2).map((o) => [o.label, o.point_units[0]]), [
    ["Aktiiviset käyttäjät", "käyttäjää"],
    ["Kierrossa olevat vaatteet", "vaatetta"],
  ]);
  const share = options.find((o) => o.kpi_id === "on_time_service_cycle_share")!;
  assert.deepEqual(share.point_units, Array(12).fill(""));
});

test("a point's unit takes its form from that month's value", () => {
  const wearers = { ...series.find((s) => s.kpi_id === "active_wearers")! };
  const first = wearers.points[0];
  assert.ok(!("withheld" in first));
  wearers.points = [{ ...first, value: 1 }, ...wearers.points.slice(1)];
  const [option] = trendOptions("fi", [wearers]);
  assert.deepEqual(option.point_units.slice(0, 2), ["käyttäjä", "käyttäjää"]);
});
