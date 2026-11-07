"use client";

// The Sites page (#30): a bar chart per Site for a KPI the KAM chooses, then the Site table with the priority-block
// KPIs as columns and each Site's fired signals. A click on a Site sets the Site filter and opens the Overview.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { t } from "../../lib/i18n.ts";
import type { SitesPage } from "../../lib/pages/sites.ts";
import { drawKey } from "../draw-key.ts";
import { useDashboard } from "../shell.tsx";
import { usePageData } from "../use-page-data.ts";
import type { SiteChart } from "./site-cards.ts";
import { siteTable } from "./site-cards.ts";

export default function Sites() {
  const { lang, meta, state, dispatch } = useDashboard();
  const router = useRouter();
  const { data, error } = usePageData<SitesPage>("/api/sites");
  const [kpi_id, setKpi] = useState<string | null>(null);
  if (error) return <div className="card warn">{error}</div>;
  if (!data) return <p className="muted">{t(lang, "Loading Sites...")}</p>;
  const table = siteTable(lang, data, meta);
  const chart = table.charts.find((c) => c.kpi_id === kpi_id) ?? table.charts[0];
  const open = (site_id: string) => {
    dispatch({ type: "site", site_id });
    router.push("/overview");
  };
  return (
    <>
      {chart && (
        <section className="section card">
          <div className="cardhead">
            <b>{t(lang, "Compare Sites")}</b>
            <span className="grow" />
            <select value={chart.kpi_id} onChange={(e) => setKpi(e.target.value)} aria-label={t(lang, "Compare Sites")}>
              {table.charts.map((c) => (
                <option key={c.kpi_id} value={c.kpi_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <SiteBars chart={chart} selected={state.site_id} onOpen={open} />
        </section>
      )}
      <section className="section">
        <p className="muted">{t(lang, "Click a Site to filter every page to it. Columns follow the priority blocks.")}</p>
        <div className="sitetable">
          <table>
            <thead>
              <tr>
                <th>{t(lang, "Site")}</th>
                {table.columns.map((c) => (
                  <th key={c.kpi_id} className="num">
                    {c.name}
                    {c.unit && <div className="muted">{c.unit}</div>}
                  </th>
                ))}
                <th>{t(lang, "Fired signals")}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.site_id} className={row.site_id === state.site_id ? "on" : ""} onClick={() => open(row.site_id)}>
                  <td>
                    <button className="sitelink">{row.name}</button>
                    <div className="muted">{row.site_type}</div>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={table.columns[i].kpi_id} className="num">
                      {cell}
                    </td>
                  ))}
                  <td>
                    {row.fired.map((f) => (
                      <span key={f.key} className="badge fired">
                        {f.name} {f.gap}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted tilenote">{t(lang, "Signals judge all of 2025.")}</div>
      </section>
    </>
  );
}

/**
 * One bar per Site for the chosen KPI, longest first. A Site with no number has no bar. The bars grow in when the KPI
 * or its values change (#33).
 */
function SiteBars({ chart, selected, onOpen }: { chart: SiteChart; selected: string | null; onOpen: (site_id: string) => void }) {
  return (
    <div
      key={drawKey(chart.kpi_id, chart.bars.map((b) => [b.site_id, b.fraction]))}
      className="hbars"
      role="list"
      aria-label={chart.name}
    >
      {chart.bars.map((bar) => (
        <button
          key={bar.site_id}
          role="listitem"
          className={`hbar${bar.site_id === selected ? " on" : ""}`}
          title={`${bar.name}: ${bar.text}`}
          onClick={() => onOpen(bar.site_id)}
        >
          <span className="lbl">{bar.name}</span>
          <span className="track">{bar.fraction !== null && <span className="fill draw-growx" style={{ width: `${bar.fraction * 100}%` }} />}</span>
          <span className="v">{bar.text}</span>
        </button>
      ))}
    </div>
  );
}
