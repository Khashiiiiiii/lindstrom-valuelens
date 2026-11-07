import assert from "node:assert/strict";
import { test } from "node:test";

import { AI_TRANSLATION_NOTE, formatNumber, monthName, t } from "./i18n.ts";

test("t picks the one or other form with Intl.PluralRules", () => {
  const sites = (n: number) => `${n} ${t("fi", "Sites_unit", { n })}`;
  assert.equal(sites(1), "1 toimipaikka");
  assert.equal(sites(24), "24 toimipaikkaa");
  assert.equal(t("sv", "{n} source(s)", { n: 1 }), "1 källa");
  assert.equal(t("sv", "{n} source(s)", { n: 3 }), "3 källor");
  assert.equal(t("en", "{n} source(s)", { n: 1 }), "1 source");
  assert.equal(t("en", "{n} source(s)", { n: 3 }), "3 sources");
});

test("t returns the English text for a key with no SV or FI entry", () => {
  const caveat = "Based on a sample of service cycles.";
  assert.equal(t("sv", caveat), caveat);
  assert.equal(t("fi", caveat), caveat);
  assert.equal(t("fi", "energy_recovery"), "Energiahyötykäyttö");
  assert.equal(t("en", "energy_recovery"), "Energy recovery");
});

test("a context-suffixed key has its own translation and English text with no suffix", () => {
  assert.equal(t("sv", "Customer_owner"), "Kunden");
  assert.equal(t("sv", "Customer"), "Kund");
  assert.equal(t("en", "Customer_owner"), "Customer");
  assert.equal(t("sv", "Owner: {x}", { x: t("sv", "Customer_owner") }), "Ansvarig: Kunden");
});

test("the dictionary holds the AI translation note in all 3 languages", () => {
  assert.equal(AI_TRANSLATION_NOTE, "AI translation. Caveats and assistant answers are in English.");
  assert.equal(t("en", AI_TRANSLATION_NOTE), AI_TRANSLATION_NOTE);
  assert.equal(t("sv", AI_TRANSLATION_NOTE), "AI-översättning. Förbehåll och assistentens svar är på engelska.");
  assert.equal(t("fi", AI_TRANSLATION_NOTE), "Tekoälykäännös. Varaumat ja avustajan vastaukset ovat englanniksi.");
});

test("numbers and month names follow the en-GB, sv-SE and fi-FI locales", () => {
  assert.equal(formatNumber("en", 1234.5), "1,234.5");
  assert.equal(formatNumber("sv", 1234.5), "1 234,5");
  assert.equal(formatNumber("fi", 1234.5), "1 234,5");
  assert.equal(monthName("en", "2025-01"), "January");
  assert.equal(monthName("sv", "2025-01"), "januari");
  assert.equal(monthName("fi", "2025-01"), "tammikuu");
  assert.equal(t("sv", "{n} source(s)", { n: 1000 }), "1 000 källor");
});
