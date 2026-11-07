"use client";

// The Opportunities page (#31): the signal groups ranked by the priorities and then by gap, each with its lever, owner
// and Sites, then the proposed next steps, each with its owner and the "proposed" mark.

import { t } from "../../lib/i18n.ts";
import type { OpportunitiesPage } from "../../lib/pages/opportunities.ts";
import { useDashboard } from "../shell.tsx";
import { usePageData } from "../use-page-data.ts";
import { opportunityCards } from "./opportunity-cards.ts";

export default function Opportunities() {
  const { lang, meta } = useDashboard();
  const { data, error } = usePageData<OpportunitiesPage>("/api/opportunities");
  if (error) return <div className="card warn">{error}</div>;
  if (!data) return <p className="muted">{t(lang, "Loading...")}</p>;
  const cards = opportunityCards(lang, data, meta);
  return (
    <>
      <div className="note">{cards.note}</div>
      <section className="section">
        <h2 className="h2 rowhead">
          {t(lang, "Signal groups")} <span className="muted">{t(lang, "ranked by your priorities, then by gap")}</span>
        </h2>
        {cards.empty && <p className="muted">{cards.empty}</p>}
        <div className="opps">
          {cards.groups.map((g) => (
            <div key={g.key} className="card opp">
              <h3>
                <span className="num">{g.position}</span>
                {g.name}
              </h3>
              <div>
                <span className="muted">{t(lang, "Lever")}: </span>
                {g.lever}
              </div>
              <div className="muted">{g.owner}</div>
              <div>
                {g.sites.map((s) => (
                  <span key={s.name} className="badge fired">
                    {s.name} {s.gap}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      {cards.steps.length > 0 && (
        <section className="section">
          <h2 className="h2">{t(lang, "Proposed next steps")}</h2>
          <div className="opps">
            {cards.steps.map((s) => (
              <div key={s.key} className="card opp">
                <h3>
                  <span className="num">{s.position}</span>
                  {s.lever}
                </h3>
                <div>
                  <span className="badge">{s.owner}</span>
                </div>
                <div className="muted">{s.sites}</div>
                <div className="proposed">{s.status}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
