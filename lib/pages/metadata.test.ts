import assert from "node:assert/strict";
import { test } from "node:test";

import { listKpis } from "../data.ts";
import { metadataPage } from "./metadata.ts";

test("the metadata lists the Customers with their default priorities, the Customer's Sites and the data months", () => {
  const meta = metadataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
  assert.deepEqual(
    meta.customers.map((c) => [c.customer_id, c.customer_name, c.default_priorities]),
    [
      ["CUST001", "NorthStar Foods Group", ["water", "service_reliability", "emissions"]],
      ["CUST002", "Apex Industrial Systems", ["garment_utilisation", "circularity"]],
      ["CUST003", "Mediora Health Network", ["traceability", "service_reliability"]],
    ],
  );
  assert.equal(meta.sites.length, 24);
  assert.ok(meta.sites.every((s) => s.customer_id === "CUST001"));
  assert.deepEqual(meta.sites[0], { site_id: "S001", site_name: "NorthStar Helsinki", customer_id: "CUST001", data_status: "SYNTHETIC" });
  assert.equal(meta.months.length, 12);
  assert.deepEqual([meta.months[0], meta.months.at(-1)], ["2025-01", "2025-12"]);
});

test("the metadata lists the 7 priorities, the signal names and the KPIs callable in the view", () => {
  const kam = metadataPage({ customer_id: "CUST001", period: "2025", view: "KAM" });
  const customer = metadataPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
  assert.deepEqual(
    kam.priorities.map((p) => p.name),
    ["Water", "Emissions", "Circularity", "Service reliability", "Garment utilisation", "Traceability", "Improvement"],
  );
  assert.equal(kam.signals.length, 6);
  assert.deepEqual(kam.signals.find((s) => s.id === "washes_per_garment_above_peers"), {
    id: "washes_per_garment_above_peers",
    name: "Washes per garment above peers",
    data_status: "SYNTHETIC",
  });
  assert.ok(kam.signals.some((s) => s.id === "service_request_rate_above_peers"));
  assert.equal(customer.signals.length, 5);
  assert.ok(!customer.signals.some((s) => s.id === "service_request_rate_above_peers"), "signal 4 is KAM view only");
  assert.deepEqual(kam.kpis, listKpis("KAM"));
  assert.deepEqual(customer.kpis, listKpis("Customer"));
  assert.ok(!customer.kpis.some((k) => k.id === "account_health"));
});
