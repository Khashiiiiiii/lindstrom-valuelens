import assert from "node:assert/strict";
import { test } from "node:test";

import type { ObservationsReply } from "../../../lib/assistant/contract.ts";
import { signalGroups } from "../../../lib/data.ts";
import { POST } from "./route.ts";

// The stub waits before it answers, so the dashboard's counter shows. The tests need no wait.
process.env.ASSISTANT_STUB_DELAY_MS = "0";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/observations", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/observations returns one observation per top signal group, up to 3", async () => {
  const response = await post({ customer_id: "CUST001", period: "2025", view: "KAM", priorities: ["water"] });
  assert.equal(response.status, 200);
  const reply = (await response.json()) as ObservationsReply;
  const top = signalGroups({ customer_id: "CUST001", view: "KAM", priorities: ["water"] }).slice(0, 3);
  assert.deepEqual(
    reply.observations.map((o) => o.signal_groups),
    JSON.parse(JSON.stringify(top.map((g) => [g]))),
  );
  assert.ok(reply.observations.every((o) => o.sources.length > 0 && o.unmatched_numbers.length === 0));
});

test("POST /api/observations returns 400 for an unknown Customer", async () => {
  const response = await post({ customer_id: "CUST999", period: "2025", view: "KAM" });
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "bad_request");
});
