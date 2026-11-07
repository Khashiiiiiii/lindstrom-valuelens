"use client";

// The Overview page (#26, #27, #28): in the KAM view the account health strip and dashboard_emphasis, then the 9
// common tiles in their fixed order with change badges and sparklines, the monthly trend chart and the on-time
// gauge, up to 3 priority blocks, and in the KAM view the waste route donut and turnaround by stage.

import Link from "next/link";
import { useState } from "react";

import { dataLabel, t } from "../../lib/i18n.ts";
import type { Lang } from "../../lib/i18n.ts";
import type { OverviewPage } from "../../lib/pages/overview.ts";
import type { SeriesPage } from "../../lib/pages/series.ts";
import { useDashboard } from "../shell.tsx";
import { usePageData } from "../use-page-data.ts";
import type { BlockCard } from "./block-cards.ts";
import type { ChartSeries } from "./chart-series.ts";
import { chartSeries } from "./chart-series.ts";
import { blockCards } from "./block-cards.ts";
import { Donut, Gauge, Sparkline, StackedBars, TrendChart } from "./charts.tsx";
import type { KamCards } from "./kam-cards.ts";
import { kamCards } from "./kam-cards.ts";
import { tileCards } from "./tile-cards.ts";

/** The Overview page for the page state, in the app language. */
export default function Overview() {
  const { lang, meta, state } = useDashboard();
  const { data, error } = usePageData<OverviewPage>("/api/overview");
  const { data: series } = usePageData<SeriesPage>("/api/monthly-series");
  if (error) return <div className="card warn">{error}</div>;
  if (!data) return <p className="muted">{t(lang, "Loading...")}</p>;
  const onTime = data.tiles.find((tile) => tile.id === "on_time_service_cycle_share")?.answers[0];
  const onTimeValue = onTime && !("withheld" in onTime) ? onTime.value : null;
  const kamAdditions = kamCards(lang, data, meta);
  const blocks = blockCards(lang, data, meta);
  return (
    <>
      {kamAdditions && <KamStrip lang={lang} kam={kamAdditions} />}
      <section className="section">
        <h2 className="h2">{t(lang, "Common indicators")}</h2>
        <div className="tiles">
          {tileCards(lang, { page: data, meta, site_id: state.site_id, series }).map((card) => (
            <div key={card.id} className="card tile">
              <div className="tilehead">
                <span className="muted tilename">{card.name}</span>
                {card.badge && (
                  <span className={`badge change ${card.badge.tone}`} title={card.badge.compared ?? undefined}>
                    {card.badge.label}
                  </span>
                )}
              </div>
              {card.badge?.compared && <div className="muted tilenote">{card.badge.compared}</div>}
              {card.badge?.caveats.map((c) => (
                <div key={c} className="caveat">
                  {c}
                </div>
              ))}
              {card.figures.map((f, i) => (
                <div key={i} className="figure">
                  {f.label && <div className="figlabel">{f.label}</div>}
                  <div>
                    <span className="value">{f.value}</span> {f.unit && <span className="unit">{f.unit}</span>}
                  </div>
                  {f.sparkline && <Sparkline values={f.sparkline} />}
                  <div className="tilemeta">
                    <span className="badge">{f.data_status}</span>
                    {f.baseline && <span className="muted"> {f.baseline}</span>}
                  </div>
                  {f.caveats.map((c) => (
                    <div key={c} className="caveat">
                      {c}
                    </div>
                  ))}
                </div>
              ))}
              {card.notes.map((n) => (
                <div key={n} className="muted tilenote">
                  {n}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section className="section row2">
        {series && <Trend lang={lang} series={series} />}
        {onTimeValue !== null && (
          <div className="card">
            <div className="cardhead">
              <b>{t(lang, "On-time service cycle share")}</b>
            </div>
            <Gauge lang={lang} value={onTimeValue} thresholds={data.on_time_thresholds} />
          </div>
        )}
      </section>
      {/* The row and "Edit priorities" stay with no priority chosen, so the KAM can add one back. */}
      <section className="section">
        <div className="h2 rowhead">
          <span>{t(lang, "Your priorities")}</span>
          <span className="muted">{data.priority_ids.map((id) => dataLabel(lang, meta.priorities.find((p) => p.id === id)?.name ?? id)).join(", ")}</span>
          <span className="grow" />
          <Link href="/priorities" className="pill">
            {t(lang, "Edit priorities")}
          </Link>
        </div>
        {blocks.length > 0 && (
          <div className="blocks">
            {blocks.map((block) => (
              <Block key={block.position} lang={lang} block={block} />
            ))}
          </div>
        )}
      </section>
      {kamAdditions && (kamAdditions.waste || kamAdditions.stages) && <KamCharts lang={lang} kam={kamAdditions} />}
    </>
  );
}

/** The account health strip and the industry's dashboard_emphasis, KAM view only. */
function KamStrip({ lang, kam }: { lang: Lang; kam: KamCards }) {
  const { health, emphasis } = kam;
  return (
    <section className="section kamstrip">
      <div className={`card health ${health.tone ?? ""}`}>
        <div className="cardhead">
          <b>{t(lang, "Account health")}</b>
          {health.rating && <span className={`badge rating ${health.tone}`}>{health.rating}</span>}
          <span className="grow" />
          <span className="badge kam">{t(lang, "KAM view only")}</span>
        </div>
        <div className="muted">
          {health.reason}
          {health.based_on && ` ${health.based_on}.`}
        </div>
        {health.inputs.length > 0 && (
          <div className="inputs">
            {health.inputs.map((input) => (
              <div key={input.name} className="input">
                <span className={`dot ${input.tone}`} />
                <span className="muted">{input.name}</span>
                <b>{input.value}</b>
                <span className="muted">{input.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {emphasis && (
        <div className="card">
          <div className="cardhead">
            <b>{emphasis.title}</b>
            <span className="muted">{emphasis.industry}</span>
            <span className="grow" />
            <span className="badge kam">{t(lang, "KAM view only")}</span>
          </div>
          {emphasis.texts.map((e) => (
            <div key={e.term} className="emphasis">
              <b>{e.term}</b> <span className="muted">{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A priority block: its headline KPIs, then its top matching signal group. */
function Block({ lang, block }: { lang: Lang; block: BlockCard }) {
  return (
    <div className="card block">
      <h3>
        <span className="num">{block.position}</span>
        {block.name}
      </h3>
      {block.figures.map((f) => (
        <div key={f.label} className="figure">
          <div className="figlabel">{f.label}</div>
          <div>
            <span className="value small">{f.value}</span> {f.unit && <span className="unit">{f.unit}</span>}
          </div>
          <div className="tilemeta">
            <span className="badge">{f.data_status}</span>
            {f.baseline && <span className="muted"> {f.baseline}</span>}
          </div>
          {f.caveats.length > 0 && (
            <details className="caveats">
              <summary>{t(lang, "{n} caveat(s)", { n: f.caveats.length })}</summary>
              {f.caveats.map((c) => (
                <div key={c} className="caveat">
                  {c}
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
      {block.signal_group ? (
        <div className="group">
          <b>{block.signal_group.name}</b>
          <div>
            <span className="muted">{t(lang, "Lever")}: </span>
            {block.signal_group.lever}
          </div>
          <div className="muted">{block.signal_group.owner}</div>
          <div className="muted">{block.signal_group.sites.join(", ")}</div>
        </div>
      ) : (
        <div className="muted">{block.no_signal}</div>
      )}
    </div>
  );
}

/** The textile waste route donut and turnaround by stage, KAM view only. */
function KamCharts({ lang, kam }: { lang: Lang; kam: KamCards }) {
  const { waste, stages } = kam;
  return (
    <section className={`section row2 ${waste && stages ? "half" : ""}`}>
      {waste && (
        <div className="card">
          <div className="cardhead">
            <b>{waste.name}</b>
            <span className="grow" />
            <span className="badge">{waste.data_status}</span>
            <span className="badge kam">{t(lang, "KAM view only")}</span>
          </div>
          <Donut segments={waste.segments} total={waste.total} unit={waste.unit} />
          {waste.caveats.map((c) => (
            <div key={c} className="caveat">
              {c}
            </div>
          ))}
        </div>
      )}
      {stages && (
        <div className="card">
          <div className="cardhead">
            <b>{stages.name}</b>
            <span className="grow" />
            <span className="badge kam">{t(lang, "KAM view only")}</span>
          </div>
          <StackedBars lang={lang} legend={stages.legend} bars={stages.bars} />
          <div className="muted">{t(lang, "Median hours per stage, by month")}</div>
          {stages.caveats.map((c) => (
            <div key={c} className="caveat">
              {c}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


/** The monthly trend chart with its KPI select. It does not show when no series has a first point that is a result. */
function Trend({ lang, series }: { lang: Lang; series: SeriesPage }) {
  const [kpi_id, setKpi] = useState<string | null>(null);
  const options = series.series
    .map(chartSeries)
    .filter((s): s is ChartSeries => s !== null && s.values.some((v) => v !== null));
  const selected = options.find((s) => s.kpi_id === kpi_id) ?? options[0];
  if (!selected) return null;
  return (
    <div className="card">
      <div className="cardhead">
        <b>{t(lang, "Monthly trend")}</b>
        <span className="grow" />
        <select value={selected.kpi_id} onChange={(e) => setKpi(e.target.value)} aria-label={t(lang, "Monthly trend")}>
          {options.map((s) => (
            <option key={s.kpi_id} value={s.kpi_id}>
              {dataLabel(lang, s.name)}
            </option>
          ))}
        </select>
      </div>
      <TrendChart
        lang={lang}
        months={series.months}
        highlighted={series.period_months}
        values={selected.values}
        unit={selected.unit}
      />
      <div className="muted">{t(lang, "Months in the selected period are highlighted.")}</div>
    </div>
  );
}
