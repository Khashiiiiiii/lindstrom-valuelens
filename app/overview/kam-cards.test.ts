import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataPage } from "../../lib/pages/metadata.ts";
import { overviewPage } from "../../lib/pages/overview.ts";
import { kamCards } from "./kam-cards.ts";

const request = { customer_id: "CUST001", period: "2025", view: "KAM" } as const;
const page = overviewPage(request);
const meta = metadataPage(request);

test("the Customer view has no KAM cards", () => {
  assert.equal(kamCards("en", overviewPage({ ...request, view: "Customer" }), meta), null);
});

test("the account health strip shows NorthStar's 2025 rating and its 3 inputs", () => {
  const { health } = kamCards("en", page, meta)!;
  assert.deepEqual([health.rating, health.tone, health.reason, health.based_on], [
    "green",
    "green",
    "Green: every rated input is green.",
    "Based on 3 of 3 inputs",
  ]);
  assert.deepEqual(
    health.inputs.map((i) => [i.name, i.value, i.rating]),
    [
      ["Account health on-time service cycle share", "98.3%", "green"],
      ["Account health service requests per 100 wearers per month", "0.44", "green"],
      ["Account health scan coverage", "84%", "green"],
    ],
  );
});

test("a Site's health uses the Site rating, and a half year is not rated", () => {
  const site = kamCards("sv", overviewPage({ ...request, site_id: "S018", period: "2025-02" }), meta)!.health;
  assert.deepEqual([site.rating, site.tone, site.reason], ["gul", "amber", "Amber: scan coverage 80.0%."]);
  assert.deepEqual(site.inputs.map((i) => i.rating), ["ej bedömd", "gul"]);
  const h1 = kamCards("en", overviewPage({ ...request, period: "2025-H1" }), meta)!.health;
  assert.deepEqual([h1.rating, h1.tone, h1.inputs], [null, null, []]);
  assert.equal(h1.reason, "Account health is rated for all of 2025 and single months only.");
});

test("the dashboard_emphasis text names the industry and its texts", () => {
  const { emphasis } = kamCards("fi", page, meta)!;
  assert.equal(emphasis?.title, "Koontinäytön painotus (esimerkki)");
  assert.equal(emphasis?.industry, "Elintarvikkeet ja juomat");
  assert.deepEqual(emphasis?.texts[1], { term: "Water efficiency", text: "Prioritize water use/savings and washed-kg efficiency." });
});

test("the waste route donut shows each route's kg and NorthStar's 2025 total, and prints no share it would have to compute", () => {
  const { waste } = kamCards("en", page, meta)!;
  assert.deepEqual([waste?.total, waste?.unit, waste?.data_status], ["16,795", "kg", "ALLOCATED ESTIMATE, SYNTHETIC"]);
  assert.deepEqual(
    waste?.segments.map((s) => [s.label, s.kg]),
    [
      ["Recycling", "12,278"],
      ["Reuse", "819"],
      ["Energy recovery", "3,243"],
      ["Incineration", "455"],
    ],
  );
  assert.ok(waste?.segments.every((s) => !s.kg.includes("%")));
  assert.deepEqual(waste?.segments.map((s) => s.fraction), page.kam_charts!.textile_waste_route_arcs.map((a) => a.fraction));
  assert.equal(kamCards("sv", page, meta)!.waste?.segments[2].label, "Energiåtervinning");
});

test("turnaround by stage has 12 stacked bars of stage hours, with the period's months marked", () => {
  const { stages } = kamCards("en", overviewPage({ ...request, period: "2025-H2" }), meta)!;
  assert.ok(stages);
  assert.deepEqual(stages.legend, ["Pickup to laundry", "In the laundry", "Laundry to delivery"]);
  assert.equal(stages.bars.length, 12);
  assert.equal(stages.bars[0].month, "Jan");
  assert.deepEqual(stages.bars.map((b) => b.in_period), [...Array(6).fill(false), ...Array(6).fill(true)]);
  const site = kamCards("en", overviewPage({ ...request, site_id: "S018" }), meta)!.stages!;
  // S018's February stage medians in service-kpis.json.
  assert.deepEqual(site.bars[1].hours, [20, 41, 22]);
  const fi = kamCards("fi", overviewPage({ ...request, site_id: "S018" }), meta)!.stages!;
  assert.deepEqual(fi.bars[1].titles, ["helmi: Noudosta pesulaan 20 tuntia", "helmi: Pesulassa 41 tuntia", "helmi: Pesulasta toimitukseen 22 tuntia"]);
});
