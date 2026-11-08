// The SV and FI coverage check of #38: every page's display text and the deck, built for every Customer, view and
// period, give no missing-translation warning in development.

import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { test } from "node:test";

import type { Period } from "../lib/data.ts";
import { getMasterData, getOpportunitySignals, listKpis, runKpi } from "../lib/data.ts";
import type { Lang } from "../lib/i18n.ts";
import { dataLabel } from "../lib/i18n.ts";
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
import { menuItems, translationNote } from "./menu.ts";
import { opportunityCards } from "./opportunities/opportunity-cards.ts";
import { blockCards } from "./overview/block-cards.ts";
import { chartSeries } from "./overview/chart-series.ts";
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
    // The Overview's trend chart select and its point titles.
    for (const s of series.series.map(chartSeries)) {
      if (s === null) continue;
      dataLabel(lang, s.name);
      for (const v of s.values) if (v !== null && s.unit !== "share") dataLabel(lang, s.unit, v);
    }
    siteTable(lang, sites, meta);
    opportunityCards(lang, opportunities, meta);
    priorityEditor(lang, meta, { customer_id: request.customer_id, priorities: meta.priorities.map((p) => p.id) });
    dataPageLabels(lang, data);
  }
}

/** The data values the Data and assumptions page shows through dataLabel. */
function dataPageLabels(lang: Lang, data: ReturnType<typeof dataPage>): void {
  for (const item of data.items) {
    if ("baselines" in item) for (const b of item.baselines) dataLabel(lang, b.selection_status);
    if (item.id === "data_status_legend") for (const e of item.entries) dataLabel(lang, e.data_status);
    if (item.id === "thresholds_and_guards") {
      for (const e of item.entries) {
        dataLabel(lang, e.name);
        dataLabel(lang, e.data_status);
        for (const p of e.parameters) dataLabel(lang, p.parameter);
      }
    }
    if ("figures" in item) {
      for (const f of item.figures) {
        dataLabel(lang, f.unit);
        dataLabel(lang, f.data_status);
      }
    }
    if ("low_cases" in item) for (const c of item.low_cases) dataLabel(lang, c.data_status);
    if ("laundries" in item) for (const l of item.laundries) dataLabel(lang, l.country);
  }
}

test("every dictionary entry has SV and FI text", () => {
  const missing = Object.entries(DICTIONARY).flatMap(([key, entry]) =>
    LANGS.filter((lang) => !(lang in entry)).map((lang) => `${lang}: ${key}`),
  );
  assert.deepEqual(missing, []);
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
