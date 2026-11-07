import assert from "node:assert/strict";
import { test } from "node:test";

import { sitesPage } from "../../../lib/pages/sites.ts";
import { POST } from "./route.ts";

const post = (body: unknown) => POST(new Request("http://localhost/api/sites", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/sites returns the Sites page data as JSON", async () => {
  const response = await post({ customer_id: "CUST001", period: "2025-H2", view: "Customer", priorities: ["circularity"] });
  assert.equal(response.status, 200);
  const expected = sitesPage({ customer_id: "CUST001", period: "2025-H2", view: "Customer", priorities: ["circularity"] });
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(expected)));
});

test("POST /api/sites returns 400 for a Site of another Customer", async () => {
  const response = await post({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "KAM" });
  assert.equal(response.status, 400);
});
