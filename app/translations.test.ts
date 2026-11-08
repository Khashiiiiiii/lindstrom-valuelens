// The SV and FI coverage check of #38: every page's display text and the deck, built for every Customer, view and
// period, give no missing-translation warning in development.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { TestContext } from "node:test";
import { test } from "node:test";

import type { Period } from "../lib/data.ts";
import { getMasterData, getOpportunitySignals, listKpis, runKpi } from "../lib/data.ts";
import type { Lang } from "../lib/i18n.ts";
import { dataLabel } from "../lib/i18n.ts";
import type { Entry } from "../lib/i18n/dictionary.ts";
import { DICTIONARY } from "../lib/i18n/dictionary.ts";
import { dataPage } from "../lib/pages/data.ts";
import { deckFile } from "../lib/pages/deck.ts";
import { metadataPage } from "../lib/pages/metadata.ts";
import { opportunitiesPage } from "../lib/pages/opportunities.ts";
import { overviewPage } from "../lib/pages/overview.ts";
import type { PageRequest } from "../lib/pages/request.ts";
import { seriesPage } from "../lib/pages/series.ts";
import { sitesPage } from "../lib/pages/sites.ts";
import { sourceCard } from "./assistant/answer-cards.ts";
import { dataCards } from "./data/data-cards.ts";
import { menuItems, translationNote } from "./menu.ts";
import { opportunityCards } from "./opportunities/opportunity-cards.ts";
import { blockCards, priorityList } from "./overview/block-cards.ts";
import { trendOptions } from "./overview/chart-series.ts";
import { kamCards } from "./overview/kam-cards.ts";
import { tileCards } from "./overview/tile-cards.ts";
import { priorityEditor } from "./priorities/priority-editor.ts";
import { siteTable } from "./sites/site-cards.ts";

const LANGS = ["sv", "fi"] as const satisfies readonly Lang[];
const VIEWS = ["KAM", "Customer"] as const;
const master = getMasterData().data;
const PERIODS: Period[] = ["2025", "2025-H1", "2025-H2", ...master.months];

/** The console warnings that `run` gives in development, once its microtasks have run. */
async function devWarnings(ctx: TestContext, run: () => Promise<void> | void): Promise<string[]> {
  const warn = ctx.mock.method(console, "warn", () => {});
  // Next's types make NODE_ENV read-only. The test sets it the way a dev server does.
  const env: Record<string, string | undefined> = process.env;
  const before = env.NODE_ENV;
  env.NODE_ENV = "development";
  try {
    await run();
  } finally {
    env.NODE_ENV = before;
  }
  await new Promise((resolve) => setImmediate(resolve));
  return warn.mock.calls.map((call) => String(call.arguments[0]));
}

/** Builds every page's display text in SV and FI for the request, as the page components do, for the warnings. */
function buildPages(request: PageRequest): void {
  const meta = metadataPage(request);
  const overview = overviewPage(request);
  const series = seriesPage(request);
  const sites = sitesPage(request);
  const opportunities = opportunitiesPage(request);
  const data = dataPage(request);
  for (const lang of LANGS) {
    menuItems(lang, opportunities.fired_count);
    translationNote(lang);
    tileCards(lang, { page: overview, meta, site_id: request.site_id ?? null, series });
    blockCards(lang, overview, meta);
    kamCards(lang, overview, meta);
    priorityList(lang, overview.priority_ids, meta);
    trendOptions(lang, series.series);
    siteTable(lang, sites, meta);
    opportunityCards(lang, opportunities, meta);
    priorityEditor(lang, meta, { customer_id: request.customer_id, priorities: meta.priorities.map((p) => p.id) });
    dataCards(lang, data);
  }
}

test("no page component calls dataLabel, so every data label comes from a .ts module that this file builds", () => {
  const components = readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".tsx"));
  const calling = components.filter((f) => readFileSync(`${import.meta.dirname}/${f}`, "utf8").includes("dataLabel("));
  assert.deepEqual(calling, []);
});

test("every dictionary entry has SV and FI text", () => {
  const missing = Object.entries(DICTIONARY).flatMap(([key, entry]) =>
    LANGS.filter((lang) => !(lang in entry)).map((lang) => `${lang}: ${key}`),
  );
  assert.deepEqual(missing, []);
});

test("an entry with a count holds a one and an other form in all 3 languages, as #20 sets", () => {
  const entries: [string, Entry][] = Object.entries(DICTIONARY);
  const halfPlural = entries.filter(([, entry]) => {
    const forms = [entry.en, entry.sv, entry.fi].map((text) => typeof text === "object");
    return forms.includes(true) && forms.includes(false);
  });
  assert.deepEqual(halfPlural.map(([key]) => key), []);
});

test("no page lists a missing translation in SV or FI, for any Customer, view, period or Site", async (ctx) => {
  const warnings = await devWarnings(ctx, () => {
    for (const { customer_id } of master.customers) {
      const siteIds = master.sites.filter((s) => s.customer_id === customer_id).map((s) => s.site_id);
      for (const view of VIEWS) {
        for (const period of PERIODS) buildPages({ customer_id, period, view });
        for (const site_id of siteIds) buildPages({ customer_id, site_id, period: "2025", view });
      }
    }
  });
  assert.deepEqual(warnings, []);
});

test("the assistant's source cards list no missing translation, Withheld sources included", async (ctx) => {
  const scopes = [
    ...master.customers.map(({ customer_id }) => ({ customer_id })),
    ...master.sites.map(({ customer_id, site_id }) => ({ customer_id, site_id })),
  ];
  const warnings = await devWarnings(ctx, () => {
    for (const scope of scopes) {
      for (const view of VIEWS) {
        for (const kpi of listKpis("KAM")) {
          const answer = runKpi(kpi.id, { scope, period: "2025", view });
          for (const lang of LANGS) sourceCard(lang, answer);
        }
      }
    }
  });
  assert.deepEqual(warnings, []);
});

test("the deck lists no missing translation in SV or FI, for any Customer or period", async (ctx) => {
  const warnings = await devWarnings(ctx, async () => {
    for (const { customer_id } of master.customers) {
      for (const period of PERIODS) {
        for (const lang of LANGS) await deckFile({ customer_id, period, view: "Customer", lang });
      }
    }
  });
  assert.deepEqual(warnings, []);
});

test("signal names in SV and FI say \"than the Customer's other Sites\"", () => {
  const names = getOpportunitySignals().catalogue.map((s) => s.name);
  assert.equal(names.length, 6);
  for (const name of names) {
    assert.match(dataLabel("sv", name), / än kundens övriga anläggningar$/, name);
    assert.match(dataLabel("fi", name), / kuin asiakkaan muissa toimipaikoissa$/, name);
  }
});
