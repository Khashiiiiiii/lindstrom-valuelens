import assert from "node:assert/strict";
import { test } from "node:test";

import { firstScreen } from "../lib/data.ts";
import { opportunitiesPage } from "../lib/pages/opportunities.ts";
import { menuItems, translationNote } from "./menu.ts";

test("switching to SV or FI translates the menu", () => {
  assert.deepEqual(
    menuItems("en").map((m) => m.label),
    ["Overview", "Sites", "Opportunities", "Priorities", "Data and assumptions"],
  );
  assert.deepEqual(
    menuItems("sv").map((m) => m.label),
    ["Översikt", "Anläggningar", "Möjligheter", "Prioriteringar", "Data och antaganden"],
  );
  assert.deepEqual(
    menuItems("fi").map((m) => m.label),
    ["Yleiskatsaus", "Toimipaikat", "Mahdollisuudet", "Painopisteet", "Tiedot ja oletukset"],
  );
  assert.equal(menuItems("sv").find((m) => m.id === "priorities")?.title, "Kundens prioriteringar");
});

test("the AI translation note shows in SV and FI only", () => {
  assert.equal(translationNote("en"), null);
  assert.equal(translationNote("sv"), "AI-översättning. Förbehåll och assistentens svar är på engelska.");
  assert.equal(translationNote("fi"), "Tekoälykäännös. Varaumat ja avustajan vastaukset ovat englanniksi.");
});

test("the menu shows the fired-signal count next to Opportunities, the same count as Optimisation potential", () => {
  const count = (request: Parameters<typeof firstScreen>[0]) =>
    menuItems("en", opportunitiesPage(request).fired_count).find((m) => m.id === "opportunities")?.count;
  const cases = [
    [{ customer_id: "CUST001", period: "2025", view: "KAM" }, "18"],
    [{ customer_id: "CUST001", period: "2025-H1", view: "Customer" }, "13"],
    [{ customer_id: "CUST001", site_id: "S018", period: "2025-03", view: "KAM" }, "2"],
  ] as const;
  for (const [request, expected] of cases) {
    assert.equal(count(request), expected);
    assert.equal(count(request), String(firstScreen(request).optimisation_potential.fired_count));
  }
  // No count with nothing fired, or before the count loads. No other page has a count.
  assert.equal(count({ customer_id: "CUST001", site_id: "S001", period: "2025", view: "KAM" }), null);
  assert.ok(menuItems("en", null).every((m) => m.count === null));
  assert.ok(menuItems("en", 18).filter((m) => m.id !== "opportunities").every((m) => m.count === null));
});
