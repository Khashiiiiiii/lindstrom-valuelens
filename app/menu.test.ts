import assert from "node:assert/strict";
import { test } from "node:test";

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
