"use client";

// The Overview page (#26, #27): the 9 common tiles in their fixed order with change badges and sparklines, then the
// monthly trend chart and the on-time gauge.

import { useState } from "react";

import type { KpiResult } from "../../lib/data.ts";
import { dataLabel, t } from "../../lib/i18n.ts";
import type { Lang } from "../../lib/i18n.ts";
import type { OverviewPage } from "../../lib/pages/overview.ts";
import type { MonthlySeries, SeriesPage } from "../../lib/pages/series.ts";
import { useDashboard } from "../shell.tsx";
import { usePageData } from "../use-page-data.ts";
import { Gauge, Sparkline, TrendChart } from "./charts.tsx";
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
  return (
    <>
      <section className="section">
        <h2 className="h2">{t(lang, "Common indicators")}</h2>
        <div className="tiles">
          {tileCards(lang, data, meta, state.site_id, series).map((card) => (
            <div key={card.id} className="card tile">
              <div className="tilehead">
                <span className="muted tilename">{card.name}</span>
                {card.badge && <span className={`badge change ${card.badge.tone}`}>{card.badge.label}</span>}
              </div>
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
    </>
  );
}

/** A series the trend chart can show: its first point is a result, and it has a value. */
function shown(s: MonthlySeries): s is MonthlySeries & { points: KpiResult[] } {
  return !("withheld" in s.points[0]) && s.points.some((p) => !("withheld" in p) && p.value !== null);
}

/** The monthly trend chart with its KPI select. It does not show when no series has a first point that is a result. */
function Trend({ lang, series }: { lang: Lang; series: SeriesPage }) {
  const [kpi_id, setKpi] = useState<string | null>(null);
  const options = series.series.filter(shown);
  const selected = options.find((s) => s.kpi_id === kpi_id) ?? options[0];
  if (!selected) return null;
  const first = selected.points[0];
  return (
    <div className="card">
      <div className="cardhead">
        <b>{t(lang, "Monthly trend")}</b>
        <span className="grow" />
        <select value={selected.kpi_id} onChange={(e) => setKpi(e.target.value)} aria-label={t(lang, "Monthly trend")}>
          {options.map((s) => (
            <option key={s.kpi_id} value={s.kpi_id}>
              {dataLabel(lang, s.points[0].name)}
            </option>
          ))}
        </select>
      </div>
      <TrendChart
        lang={lang}
        months={series.months}
        highlighted={series.period_months}
        values={selected.points.map((p) => ("withheld" in p ? null : p.value))}
        unit={first.unit}
      />
      <div className="muted">{t(lang, "Months in the selected period are highlighted.")}</div>
    </div>
  );
}
