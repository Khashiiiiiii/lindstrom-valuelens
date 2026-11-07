import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataPage } from "../../lib/pages/metadata.ts";
import { overviewPage } from "../../lib/pages/overview.ts";
import type { OverviewPage } from "../../lib/pages/overview.ts";
import { blockCards } from "./block-cards.ts";

const request = { customer_id: "CUST001", period: "2025", view: "Customer" } as const;
const page = overviewPage(request);
const meta = metadataPage(request);
const SITES = ["NorthStar Pori", "NorthStar Gdańsk", "NorthStar Kraków", "NorthStar Lahti"];

test("NorthStar's 3 blocks show in priority order, each with its headline KPIs and top matching signal group", () => {
  const cards = blockCards("en", page, meta);
  assert.deepEqual(
    cards.map((c) => [c.position, c.name]),
    [
      [1, "Water"],
      [2, "Service reliability"],
      [3, "Emissions"],
    ],
  );
  assert.deepEqual(
    cards[0].figures.map((f) => [f.label, f.value, f.unit, f.data_status]),
    [
      ["Water use (allocated)", "3,363,227", "l", "ALLOCATED ESTIMATE, SYNTHETIC"],
      ["Washes per garment", "1.97", "washes per garment per month", "SYNTHETIC"],
    ],
  );
  assert.deepEqual(cards[0].signal_group, {
    name: "Washes per garment above peers",
    lever: "Review the Site's garment change routine.",
    owner: "Owner: Customer",
    // The Sites of the 4 fired washes_per_garment results in opportunity-signals.json, largest gap first.
    sites: SITES,
  });
  assert.deepEqual(cards[1].signal_group?.name, "Late service cycles above peers");
  const site = blockCards("en", overviewPage({ ...request, site_id: "S008" }), meta);
  assert.deepEqual(site[0].signal_group?.sites, ["NorthStar Pori"]);
  const energy = cards[2].figures.find((f) => f.label === "Energy saved")!;
  assert.equal(energy.baseline, "vs outsourced local laundry");
  assert.equal(energy.caveats[0], "Baseline factors are illustrative. Savings may be overstated.");
});

test("a block with no matching fired signal group says so", () => {
  const water = overviewPage({ ...request, site_id: "S018", priorities: ["Water"] });
  const [card] = blockCards("en", water, meta);
  assert.equal(card.signal_group, null);
  assert.equal(card.no_signal, "No fired signal for this priority.");
});

test("switching to SV and FI translates block names, KPI names, levers and owners", () => {
  const sv = blockCards("sv", page, meta)[0];
  assert.deepEqual([sv.name, sv.signal_group?.owner], ["Vatten", "Ansvarig: kunden"]);
  const fi = blockCards("fi", page, meta);
  assert.deepEqual(
    [fi[1].name, fi[1].signal_group?.lever, fi[1].signal_group?.owner],
    ["Toimitusvarmuus", "Selvitä myöhästyneet palvelukierrokset vaiheittain.", "Vastuu: Lindström"],
  );
});

test("a block whose answers are all Withheld does not show, and a Withheld answer has no figure", () => {
  const withheld = { kpi_id: "x", withheld: true as const, reason: "KAM view only" as const };
  const changed: OverviewPage = {
    ...page,
    priority_blocks: page.priority_blocks.map((b, i) =>
      i === 0 ? { ...b, answers: b.answers.map(() => withheld) } : i === 1 ? { ...b, answers: [withheld, ...b.answers.slice(1)] } : b,
    ),
  };
  const cards = blockCards("en", changed, meta);
  assert.deepEqual(cards.map((c) => c.name), ["Service reliability", "Emissions"]);
  assert.equal(cards[0].figures.length, 2);
});
