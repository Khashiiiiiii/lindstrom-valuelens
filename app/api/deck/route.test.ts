import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";

import { POST } from "./route.ts";

const post = (body: unknown) => POST(new Request("http://localhost/api/deck", { method: "POST", body: JSON.stringify(body) }));

test("POST /api/deck returns the deck as a .pptx file with 12 slides", async () => {
  const response = await post({ customer_id: "CUST001", period: "2025-H2", view: "KAM", priorities: ["water"], lang: "sv" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename\*=UTF-8''.+\.pptx$/);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  assert.equal(Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 12);
});

test("POST /api/deck returns 400 for an unknown language and a Site of another Customer", async () => {
  const unknownLang = await post({ customer_id: "CUST001", period: "2025", view: "Customer", lang: "de" });
  assert.equal(unknownLang.status, 400);
  assert.deepEqual(await unknownLang.json(), { error: { code: "bad_request", message: 'lang must be "en", "sv" or "fi".' } });
  const otherSite = await post({ customer_id: "CUST002", site_id: "S008", period: "2025", view: "Customer", lang: "en" });
  assert.equal(otherSite.status, 400);
});
