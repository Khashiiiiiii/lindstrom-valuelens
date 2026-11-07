"use client";

// The Data and assumptions page (#32): what the figures rest on. The Customer view shows the Customer version of
// Data transparency. The KAM view adds the laundry factors, the public figure comparison, the KAM notes and every
// threshold and guard. Item names and texts stay English. The page ends with the logo credit.

import type { ReactNode } from "react";

import type { Baseline, BaselineFactor, PublicFigure } from "../../lib/data.ts";
import type { DictionaryKey, Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber, monthName, t } from "../../lib/i18n.ts";
import type { DataPage, DataPageItem, LaundryHead, LaundryWaterAndEnergyFactorsItem } from "../../lib/pages/data.ts";
import { useDashboard } from "../shell.tsx";
import { usePageData } from "../use-page-data.ts";

/** One laundry month of water and energy per washed kg. */
type LaundryMonth = LaundryWaterAndEnergyFactorsItem["laundries"][number]["months"][number];

/** The column header of each baseline factor, also used to name a low case's factor. */
const FACTOR_HEADS: Record<BaselineFactor, DictionaryKey> = {
  water_l_per_kg: "Water, L/kg",
  energy_kwh_per_kg: "Energy, kWh/kg",
  process_kgco2e_per_kg: "Process CO2e, kg/kg",
  delivery_kgco2e_per_kg: "Delivery CO2e, kg/kg",
};

const LOGO_URL = "https://commons.wikimedia.org/wiki/File:Lindstrom_logo_RGB.png";

export default function DataAndAssumptions() {
  const { lang } = useDashboard();
  const { data, error } = usePageData<DataPage>("/api/data");
  if (error) return <div className="card warn">{error}</div>;
  if (!data) return <p className="muted">{t(lang, "Loading data and assumptions...")}</p>;
  return (
    <>
      <div className="dataitems">
        {data.items.map((item) => (
          <section key={item.id} className="card dataitem">
            <div className="cardhead">
              <b>{item.name}</b>
              {item.view === "KAM" && <span className="badge kam">{t(lang, "KAM view")}</span>}
            </div>
            <p className="muted">{item.text}</p>
            <ItemRows lang={lang} item={item} />
          </section>
        ))}
      </div>
      <p className="muted tilenote logocredit">
        <a href={LOGO_URL} target="_blank" rel="noreferrer">
          {t(lang, "The Lindström logo is from Wikimedia Commons, licensed CC BY-SA 4.0.")}
        </a>
      </p>
    </>
  );
}

/** The rows of one item, by its kind. */
function ItemRows({ lang, item }: { lang: Lang; item: DataPageItem }) {
  const n = (value: number) => formatNumber(lang, value);
  switch (item.id) {
    case "baseline_used":
      return <BaselineTable lang={lang} baselines={item.baselines} />;
    case "assumption_list":
      return (
        <ul className="datalist">
          {item.assumptions.map((a) => (
            <li key={a.assumption_id}>
              <b>
                {a.assumption_id} {a.assumption}
              </b>
              : {a.value_or_rule}
              <div className="muted">{a.rationale}</div>
              <span className="badge">
                {t(lang, "Confidence")}: {a.confidence}
              </span>{" "}
              <span className="badge">
                {t(lang, "Treatment")}: {a.treatment}
              </span>
            </li>
          ))}
        </ul>
      );
    case "data_status_legend":
      return (
        <ul className="datalist">
          {item.entries.map((e) => (
            <li key={e.data_status}>
              <span className="badge">{dataLabel(lang, e.data_status)}</span> {e.text}
            </li>
          ))}
        </ul>
      );
    case "data_gaps":
      return (
        <ul className="datalist">
          {item.entries.map((e) => (
            <li key={e.id}>
              <b>{e.name}</b>: {e.text}
            </li>
          ))}
        </ul>
      );
    case "laundry_water_and_energy_factors": {
      const months = item.laundries[0]?.months.map((m) => m.month) ?? [];
      const table = (title: string, value: (m: LaundryMonth) => number) => (
        <Table head={[title, ...months.map((m) => monthName(lang, m, "short"))]} numeric>
          {item.laundries.map((l) => (
            <tr key={l.laundry_id}>
              <LaundryCell lang={lang} laundry={l} />
              {l.months.map((m) => (
                <td key={m.month} className="num">
                  {n(value(m))}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      );
      return (
        <>
          {table(t(lang, "Water, L/kg"), (m) => m.fresh_water_l_per_kg)}
          {table(t(lang, "Energy, kWh/kg"), (m) => m.energy_kwh_per_kg)}
        </>
      );
    }
    case "laundry_waste_factors":
      return (
        <Table head={[t(lang, "Laundry"), t(lang, "Textile waste, g per washed kg")]} numeric>
          {item.laundries.map((l) => (
            <tr key={l.laundry_id}>
              <LaundryCell lang={lang} laundry={l} />
              <td className="num">{n(l.waste_g_per_washed_kg)}</td>
            </tr>
          ))}
        </Table>
      );
    case "process_co2e_per_kwh":
      return (
        <Table head={[t(lang, "Laundry"), t(lang, "Process CO2e, kg per kWh")]} numeric>
          {item.laundries.map((l) => (
            <tr key={l.laundry_id}>
              <LaundryCell lang={lang} laundry={l} />
              <td className="num">{n(l.process_kgco2e_per_kwh)}</td>
            </tr>
          ))}
        </Table>
      );
    case "baseline_factors_and_dataset_actuals_against_public_figures":
      return (
        <>
          <BaselineTable lang={lang} baselines={item.baselines} />
          <Table head={[t(lang, "Public figure"), t(lang, "Value"), t(lang, "Applicability"), t(lang, "Source")]}>
            {item.figures.map((f) => (
              <tr key={f.id}>
                <td>
                  <b>{f.name}</b>
                  <div className="muted">{f.scope}</div>
                </td>
                <td className="num">
                  {figureValue(lang, f)} {dataLabel(lang, f.unit)}
                </td>
                <td>{f.applicability}</td>
                <td>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.source}
                    </a>
                  ) : (
                    f.source
                  )}
                  {f.page && <div className="muted">{t(lang, "Page {x}", { x: f.page })}</div>}
                  <span className="badge">{dataLabel(lang, f.data_status)}</span>
                </td>
              </tr>
            ))}
          </Table>
          <ul className="datalist">
            {item.low_cases.map((c) => (
              <li key={c.id}>
                <b>{t(lang, "Low case")}</b>: {item.baselines.find((b) => b.baseline_id === c.baseline_id)?.baseline_name ?? c.baseline_id},{" "}
                {t(lang, FACTOR_HEADS[c.factor])} {n(c.value)}{" "}
                <span className="badge">{dataLabel(lang, c.data_status)}</span>
                <div className="muted">{c.rationale}</div>
              </li>
            ))}
          </ul>
        </>
      );
    case "group_emissions_intensity_notes":
      return (
        <>
          <p>{item.context_line}</p>
          <Notes notes={item.notes} />
        </>
      );
    case "january_2026_cycles":
      return <Notes notes={item.notes} />;
    case "thresholds_and_guards":
      return (
        <Table head={[t(lang, "Threshold or guard"), t(lang, "Values"), t(lang, "Rationale")]}>
          {item.entries.map((e) => (
            <tr key={`${e.file}/${e.catalogue_id}`}>
              <td>
                <b>{dataLabel(lang, e.name)}</b> <span className="badge">{dataLabel(lang, e.data_status)}</span>
                <div className="muted">{e.definition}</div>
              </td>
              <td className="nowrap">
                {e.parameters.map((p) => (
                  <div key={p.parameter}>
                    {dataLabel(lang, p.parameter)}: {n(p.value)}
                  </div>
                ))}
              </td>
              <td>{e.rationale}</td>
            </tr>
          ))}
        </Table>
      );
  }
}

/** The 3 washing alternatives with their factors per washed kg and their mixed waste share, the default one first. */
function BaselineTable({ lang, baselines }: { lang: Lang; baselines: Baseline[] }) {
  const n = (value: number) => formatNumber(lang, value);
  const factors = Object.keys(FACTOR_HEADS) as BaselineFactor[];
  return (
    <Table head={[t(lang, "Baseline"), ...factors.map((f) => t(lang, FACTOR_HEADS[f])), t(lang, "Mixed waste share")]} numeric>
      {baselines.map((b) => (
        <tr key={b.baseline_id}>
          <td>
            <b>{b.baseline_name}</b> <span className={`badge${b.selection_status === "DEFAULT" ? " kam" : ""}`}>{dataLabel(lang, b.selection_status)}</span>
            <div className="muted">{b.assumption_note}</div>
          </td>
          {factors.map((f) => (
            <td key={f} className="num">
              {n(b[f])}
            </td>
          ))}
          <td className="num">{formatNumber(lang, b.mixed_waste_share, { style: "percent" })}</td>
        </tr>
      ))}
    </Table>
  );
}

/** A table with a header row. With `numeric`, every column after the first is right-aligned. */
function Table({ head, numeric = false, children }: { head: string[]; numeric?: boolean; children: ReactNode }) {
  return (
    <div className="sitetable datatable">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={numeric && i > 0 ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** English notes, one per line. */
function Notes({ notes }: { notes: { text: string }[] }) {
  return (
    <ul className="datalist">
      {notes.map((note) => (
        <li key={note.text}>{note.text}</li>
      ))}
    </ul>
  );
}

function LaundryCell({ lang, laundry }: { lang: Lang; laundry: LaundryHead }) {
  return (
    <td>
      <b>{laundry.laundry_name}</b>
      <div className="muted">{dataLabel(lang, laundry.country)}</div>
    </td>
  );
}

/** A public figure's value, or its range as "low to high". */
function figureValue(lang: Lang, figure: PublicFigure): string {
  if (typeof figure.value === "number") return formatNumber(lang, figure.value);
  return t(lang, "{low} to {high}", { low: figure.value.low, high: figure.value.high });
}
