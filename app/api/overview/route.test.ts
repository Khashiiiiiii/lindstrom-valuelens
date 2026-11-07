import assert from "node:assert/strict";
import { test } from "node:test";

import { firstScreen } from "../../../lib/data.ts";
import { POST } from "./route.ts";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/overview", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/overview returns the first screen as JSON", async () => {
  const response = await post({ customer_id: "CUST001", period: "2025", view: "Customer", priorities: ["water"] });
  assert.equal(response.status, 200);
  const expected = firstScreen({ customer_id: "CUST001", period: "2025", view: "Customer", priorities: ["water"] });
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(expected)));
});

test("POST /api/overview returns 400 for a Site of another Customer", async () => {
  const response = await post({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "Customer" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "bad_request", message: "Site S008 belongs to CUST001, not CUST002." },
  });
});

test("POST /api/overview returns 400 for a body that is not a page request", async () => {
  for (const body of [{ customer_id: "CUST001", period: "2025", view: "Manager" }, { period: "2025", view: "KAM" }, "x"]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body));
  }
});
