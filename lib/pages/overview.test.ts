import assert from "node:assert/strict";
import { test } from "node:test";

import { firstScreen, getMasterData } from "../data.ts";
import { overviewPage } from "./overview.ts";

test("the Overview for NorthStar, 2025 and default priorities equals firstScreen", () => {
  for (const view of ["KAM", "Customer"] as const) {
    const page = overviewPage({ customer_id: "CUST001", period: "2025", view });
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
