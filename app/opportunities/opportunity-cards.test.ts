import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataPage } from "../../lib/pages/metadata.ts";
import type { PageRequest } from "../../lib/pages/request.ts";
import { opportunitiesPage } from "../../lib/pages/opportunities.ts";
import { overviewPage } from "../../lib/pages/overview.ts";
import { tileCards } from "../overview/tile-cards.ts";
import { opportunityCards } from "./opportunity-cards.ts";

const request: PageRequest = { customer_id: "CUST001", period: "2025", view: "Customer" };
const meta = metadataPage(request);
const cards = (lang: "en" | "sv" | "fi", r: PageRequest = request) => opportunityCards(lang, opportunitiesPage(r), metadataPage(r));

test("each signal group card shows its signal, lever, owner and Sites with their gap, in rank order", () => {
  const { groups } = cards("en");
  assert.deepEqual(
    groups.map((g) => [g.position, g.name]),
    [
      [1, "Washes per garment above peers"],
      [2, "Late service cycles above peers"],
      [3, "Garment allocation above peers"],
      [4, "Allocated garments with no scan activity above peers"],
      [5, "Repair rate above peers"],
    ],
  );
  // The 4 fired washes_per_garment results in opportunity-signals.json, largest gap first.
  assert.deepEqual(groups[0], {
    key: "washes_per_garment_above_peers",
    position: 1,
    name: "Washes per garment above peers",
    lever: "Review the Site's garment change routine.",
    owner: "Owner: Customer",
    sites: [
      { name: "NorthStar Pori", gap: "+15%" },
      { name: "NorthStar Gdańsk", gap: "+13%" },
      { name: "NorthStar Kraków", gap: "+12%" },
      { name: "NorthStar Lahti", gap: "+11%" },
    ],
  });
});

test("every proposed next step shows its owner and the proposed mark", () => {
  const { steps } = cards("en");
  assert.deepEqual(
    steps.map((s) => [s.position, s.lever, s.owner, s.status]),
    [
      [1, "Review the Site's garment change routine.", "Owner: Customer", "Proposed, to be agreed in the meeting."],
      [2, "Investigate the late cycles by stage.", "Owner: Lindström", "Proposed, to be agreed in the meeting."],
      [3, "Check wearer counts and spares, then right-size the allocation.", "Owner: Joint", "Proposed, to be agreed in the meeting."],
    ],
  );
  assert.equal(steps[1].sites, "Sites: NorthStar Pori");
  const fi = cards("fi").steps[1];
  assert.deepEqual([fi.owner, fi.status], ["Vastuu: Lindström", "Ehdotus, sovitaan kokouksessa."]);
});

test("the note that signals judge all of 2025 shows on the page and under the Optimisation potential tile for every period", () => {
  for (const period of ["2025", "2025-H1", "2025-H2", "2025-03"] as const) {
    assert.equal(cards("en", { ...request, period }).note, "Signals judge all of 2025.", period);
    const tile = tileCards("en", { page: overviewPage({ ...request, period }), meta, site_id: null, series: null }).find(
      (c) => c.id === "optimisation_potential",
    )!;
    assert.ok(tile.notes.includes("Signals judge all of 2025."), period);
  }
  assert.equal(cards("sv").note, "Signalerna bedömer hela 2025.");
});

test("a Site with no fired signal says so and proposes no next step", () => {
  const page = cards("en", { ...request, site_id: "S001" });
  assert.deepEqual([page.groups, page.steps, page.empty], [[], [], "No fired signals."]);
  assert.equal(cards("en").empty, null);
});
