import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { test } from "node:test";

import type { HealthRating } from "./data/account-health.ts";
import { listKpis, runKpi } from "./data/calculations.ts";
import { getCustomerPriorities } from "./data/customer-priorities.ts";
import type { LeverOwner } from "./data/opportunity-signals.ts";
import { getOpportunitySignals } from "./data/opportunity-signals.ts";
import type { ComparisonLabel } from "./data/period-comparisons.ts";
import type { DataStatus, ReviewPart } from "./data/processed.ts";
import type { KpiAnswer, KpiQuery } from "./data/query.ts";
import { getViewsAndReview } from "./data/views-and-review.ts";
import type { DictionaryKey } from "./i18n.ts";
import { AI_TRANSLATION_NOTE, dataLabel, formatNumber, monthName, t } from "./i18n.ts";

/** A label that a data type allows, as a dictionary key. tsc rejects this function if one has no key. */
const labelKey = (
  label: ComparisonLabel | DataStatus | HealthRating | ReviewPart | `${LeverOwner}_owner`,
): DictionaryKey => label;

test("every period comparison label, data status, rating, review part and lever owner is a dictionary key", () => {
  assert.equal(t("en", labelKey("better")), "Better");
  assert.equal(t("sv", labelKey("better")), "Bättre");
  assert.equal(t("fi", labelKey("better")), "Parantunut");
  assert.equal(t("sv", labelKey("Joint_owner")), "gemensamt");
});

test("t picks the one or other form with Intl.PluralRules", () => {
  const sites = (n: number) => `${n} ${t("fi", "Sites_unit", { n })}`;
  assert.equal(sites(1), "1 toimipaikka");
  assert.equal(sites(24), "24 toimipaikkaa");
  assert.equal(t("sv", "{n} source(s)", { n: 1 }), "1 källa");
  assert.equal(t("sv", "{n} source(s)", { n: 3 }), "3 källor");
  assert.equal(t("en", "{n} source(s)", { n: 1 }), "1 source");
  assert.equal(t("en", "{n} source(s)", { n: 3 }), "3 sources");
});

test("t needs a number n for a key with plural forms, so the count and its form always match", () => {
  // @ts-expect-error No n, which would show "{n} sources".
  t("en", "{n} source(s)");
  // @ts-expect-error A string n, which would show "1 källor".
  t("sv", "{n} source(s)", { n: "1" });
  assert.equal(t("sv", "{n} source(s)", { n: 1 }), "1 källa");
  assert.equal(t("sv", "AI observation {n}", { n: "2" }), "AI-observation 2");
});

test("t takes only dictionary keys, so npm run typecheck rejects a misspelled key", () => {
  // @ts-expect-error "Overveiw" is not a key.
  t("sv", "Overveiw");
  assert.equal(t("sv", "Overview"), "Översikt");
});

test("caveats and transparency texts are English only and are not dictionary keys", () => {
  // @ts-expect-error The "may be overstated" caveat of Emissions saved and Water saved.
  t("sv", "may be overstated");
  // @ts-expect-error The circularity caveat.
  t("sv", "Laundry outcome, the Customer cannot influence the route mix.");
  // @ts-expect-error The baseline caveat on the sustainability slide.
  t("sv", "Compared with outsourced local laundry. The savings may be overstated.");
  // @ts-expect-error The baseline caveat on the data slide.
  t("sv", "Savings are compared with outsourced local laundry and may be overstated.");
  // @ts-expect-error The deferred Financial Value note.
  t("sv", "Financial value is not shown, because the data holds no Customer cost or price.");
  // @ts-expect-error The Customer Experience data gap.
  t("sv", "Customer Experience data is not available yet, so satisfaction is not shown.");
});

test("dataLabel returns the English text for a data value with no SV or FI entry", () => {
  assert.equal(dataLabel("sv", "Hygiene"), "Hygiene");
  assert.equal(dataLabel("fi", "Hygiene"), "Hygiene");
  assert.equal(dataLabel("fi", "energy_recovery"), "Energiahyötykäyttö");
  assert.equal(dataLabel("en", "energy_recovery"), "Energy recovery");
});

test("dataLabel picks a unit's one or other form from the value, and the other form with no value", () => {
  assert.equal(dataLabel("fi", "hours", 1), "tunti");
  assert.equal(dataLabel("fi", "hours", 24), "tuntia");
  assert.equal(dataLabel("en", "wearers", 1), "wearer");
  assert.equal(dataLabel("en", "wearers"), "wearers");
});

test("dataLabel shows a data id with no entry as readable English, never the raw id", () => {
  assert.equal(dataLabel("sv", "unknown_route"), "Unknown route");
  assert.equal(dataLabel("en", "NEW_STATUS"), "New status");
});

/** The console warnings that the calls in `run` give in development. */
async function devWarnings(ctx: TestContext, run: () => void): Promise<string[]> {
  const warn = ctx.mock.method(console, "warn", () => {});
  // Next's types make NODE_ENV read-only. The test sets it the way a dev server does.
  const env: Record<string, string | undefined> = process.env;
  const before = env.NODE_ENV;
  env.NODE_ENV = "development";
  try {
    run();
  } finally {
    env.NODE_ENV = before;
  }
  await new Promise((resolve) => setImmediate(resolve));
  return warn.mock.calls.map((call) => String(call.arguments[0]));
}

test("in development, a data value with no entry gives a console warning in every language", async (ctx) => {
  const warnings = await devWarnings(ctx, () => {
    dataLabel("en", "brand_new_route");
    dataLabel("sv", "brand_new_route");
    dataLabel("en", "energy_recovery");
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^en: brand_new_route$/m);
  assert.match(warnings[0], /^sv: brand_new_route$/m);
  assert.doesNotMatch(warnings[0], /energy_recovery/);
});

/** runKpi, or null if it throws an error that matches `skip`. */
function runKpiOrSkip(kpi_id: string, query: KpiQuery, skip: RegExp): KpiAnswer | null {
  try {
    return runKpi(kpi_id, query);
  } catch (error) {
    if (error instanceof Error && skip.test(error.message)) return null;
    throw error;
  }
}

test("every KPI, tile, priority, signal and lever name, unit, breakdown key and baseline label in the data has SV and FI text", async (ctx) => {
  const values = new Set<string>();
  for (const kpi of listKpis("KAM")) {
    values.add(kpi.name);
    const variants = [
      {},
      { unit: "per_active_wearer" },
      { baseline_id: "B_HOME" },
      { baseline_id: "B_INHOUSE" },
      ...["repair_type", "emission_source", "treatment_route"].map((breakdown) => ({ breakdown })),
    ] as const;
    for (const variant of variants) {
      if (Object.keys(variant).some((p) => !(kpi.parameters as string[]).includes(p))) continue;
      const query = { scope: { customer_id: "CUST001" }, period: "2025", view: "KAM", ...variant } as const;
      // listKpis says a KPI takes a breakdown, not which one. runKpi names the right one when it throws.
      const answer = runKpiOrSkip(kpi.id, query, /has no breakdown/);
      if (answer === null || "withheld" in answer) continue;
      values.add(answer.unit);
      for (const part of answer.breakdown ?? []) values.add(part.key);
      if (answer.detail?.kind === "handprint") values.add(answer.detail.baseline_label);
    }
  }
  for (const tile of getViewsAndReview().data.first_screen.common_tiles) values.add(tile.name);
  for (const priority of getCustomerPriorities().catalogue) values.add(priority.name);
  for (const signal of getOpportunitySignals().catalogue) values.add(signal.name).add(signal.lever);
  const warnings = await devWarnings(ctx, () => {
    for (const value of values) for (const lang of ["sv", "fi"] as const) dataLabel(lang, value);
  });
  assert.deepEqual(warnings, []);
});

test("a context-suffixed key has its own translation and English text with no suffix", () => {
  assert.equal(t("sv", "Customer_owner"), "kunden");
  assert.equal(t("sv", "Customer"), "Kund");
  assert.equal(t("en", "Customer_owner"), "Customer");
  assert.equal(t("fi", "Joint_owner"), "yhteinen");
  assert.equal(t("sv", "Owner: {x}", { x: t("sv", "Customer_owner") }), "Ansvarig: kunden");
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
