"use client";

// The Overview page (#26): the 9 common tiles in their fixed order.

import { t } from "../../lib/i18n.ts";
import type { OverviewPage } from "../../lib/pages/overview.ts";
import { useDashboard } from "../shell.tsx";
import { usePageData } from "../use-page-data.ts";
import { tileCards } from "./tile-cards.ts";

/** The Overview page: the 9 common tiles for the page state, in the app language. */
export default function Overview() {
  const { lang, meta, state } = useDashboard();
  const { data, error } = usePageData<OverviewPage>("/api/overview");
  if (error) return <div className="card warn">{error}</div>;
  if (!data) return <p className="muted">{t(lang, "Loading...")}</p>;
  return (
    <section className="section">
      <h2 className="h2">{t(lang, "Common indicators")}</h2>
      <div className="tiles">
        {tileCards(lang, data, meta, state.site_id).map((card) => (
          <div key={card.id} className="card tile">
            <div className="muted tilename">{card.name}</div>
            {card.figures.map((f, i) => (
              <div key={i} className="figure">
                {f.label && <div className="figlabel">{f.label}</div>}
                <div>
                  <span className="value">{f.value}</span> {f.unit && <span className="unit">{f.unit}</span>}
                </div>
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
  );
}
