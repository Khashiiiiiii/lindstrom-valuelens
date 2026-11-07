import assert from "node:assert/strict";
import { test } from "node:test";

import { dataPage } from "../../../lib/pages/data.ts";
import { POST } from "./route.ts";

const post = (body: unknown) => POST(new Request("http://localhost/api/data", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/data returns the Data and assumptions page data as JSON", async () => {
  const response = await post({ customer_id: "CUST001", period: "2025", view: "KAM" });
  assert.equal(response.status, 200);
  const expected = dataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(expected)));
});

test("POST /api/data returns 400 for a Site of another Customer", async () => {
  const response = await post({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "Customer" });
  assert.equal(response.status, 400);
});
