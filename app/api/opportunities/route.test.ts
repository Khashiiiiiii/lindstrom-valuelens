import assert from "node:assert/strict";
import { test } from "node:test";

import { opportunitiesPage } from "../../../lib/pages/opportunities.ts";
import { POST } from "./route.ts";

const post = (body: unknown) => POST(new Request("http://localhost/api/opportunities", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/opportunities returns the Opportunities page data as JSON", async () => {
  const response = await post({ customer_id: "CUST001", site_id: "S008", period: "2025-03", view: "Customer", priorities: ["service_reliability"] });
  assert.equal(response.status, 200);
  const expected = opportunitiesPage({ customer_id: "CUST001", site_id: "S008", period: "2025-03", view: "Customer", priorities: ["service_reliability"] });
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(expected)));
});

test("POST /api/opportunities returns 400 for a Site of another Customer", async () => {
  const response = await post({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "KAM" });
  assert.equal(response.status, 400);
});
