import assert from "node:assert/strict";
import { test } from "node:test";

import { seriesPage } from "../../../lib/pages/series.ts";
import { POST } from "./route.ts";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/monthly-series", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/monthly-series returns the monthly series as JSON", async () => {
  const response = await post({ customer_id: "CUST001", site_id: "S008", period: "2025-H1", view: "Customer" });
  assert.equal(response.status, 200);
  const expected = seriesPage({ customer_id: "CUST001", site_id: "S008", period: "2025-H1", view: "Customer" });
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(expected)));
});

test("POST /api/monthly-series returns 400 for a Site of another Customer", async () => {
  const response = await post({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "KAM" });
  assert.equal(response.status, 400);
});
