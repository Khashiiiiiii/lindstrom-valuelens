"use client";

// The app shell (#26): the left menu, the sticky top bar, the page title with the period and view controls, and
// the client state every page reads. The page state is in page-state.ts. The language persists in localStorage.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useReducer, useState } from "react";

import type { Period } from "../lib/data.ts";
import type { Lang } from "../lib/i18n.ts";
import { monthName, t } from "../lib/i18n.ts";
import type { Metadata } from "../lib/pages/metadata.ts";
import type { OpportunitiesPage } from "../lib/pages/opportunities.ts";
import type { PageRequest } from "../lib/pages/request.ts";
import { ExportDeck } from "./export-deck.tsx";
import type { PageId } from "./menu.ts";
import { menuItems, translationNote } from "./menu.ts";
import type { PageAction, PageState } from "./page-state.ts";
import { pageRequest, pageState } from "./page-state.ts";

/** The Customer the app opens on: NorthStar Foods Group, the demo Customer. */
const FIRST_CUSTOMER_ID = "CUST001";
const LANG_KEY = "valuelens.lang";
const LANGS: Lang[] = ["en", "sv", "fi"];
const PERIOD_PILLS: { period: Period; label: string }[] = [
  { period: "2025", label: "2025" },
  { period: "2025-H1", label: "H1" },
  { period: "2025-H2", label: "H2" },
];

interface Dashboard {
  lang: Lang;
  state: PageState;
  dispatch: (action: PageAction) => void;
  meta: Metadata;
}

const DashboardContext = createContext<Dashboard | null>(null);

/** The language, page state and metadata. Only pages inside the shell call it, after the metadata has loaded. */
export function useDashboard(): Dashboard {
  const dashboard = useContext(DashboardContext);
  if (dashboard === null) throw new Error("useDashboard needs the Shell.");
  return dashboard;
}

/** POST a page request to a page data route. Throws with the route's error message on a non-2xx reply. */
export async function postPage<T>(route: string, body: PageRequest, signal?: AbortSignal): Promise<T> {
  const response = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message ?? `${route} answered ${response.status}.`);
  return json as T;
}

/** The message of a thrown value. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The left menu, top bar, page title and controls around every page, and the client state the pages read. */
export function Shell({ children }: { children: ReactNode }) {
  const [lang, setLang] = useLang();
  const [state, dispatch] = useReducer(pageState, null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // The metadata follows the Customer (its Sites) and the view (the KPIs callable in it).
  const customer_id = state?.customer_id ?? FIRST_CUSTOMER_ID;
  const view = state?.view ?? "KAM";
  useEffect(() => {
    const controller = new AbortController();
    const body = state ? pageRequest(state) : { customer_id, period: "2025" as const, view };
    postPage<Metadata>("/api/metadata", body, controller.signal)
      .then((loaded) => {
        setMeta(loaded);
        setError(null);
        if (state === null) {
          const first = loaded.customers.find((c) => c.customer_id === FIRST_CUSTOMER_ID) ?? loaded.customers[0];
          dispatch({ type: "customer", customer: first });
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
    // The metadata depends on the Customer and view only, not on the period or priorities.
  }, [customer_id, view]);

  const items = menuItems(lang, useFiredCount(state));
  const current = items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ?? items[0];
  const customer = meta?.customers.find((c) => c.customer_id === state?.customer_id) ?? null;
  const site = meta?.sites.find((s) => s.site_id === state?.site_id) ?? null;
  const note = translationNote(lang);

  return (
    <div className={`wrap${collapsed ? " collapsed" : ""}`}>
      <nav className="nav">
        <div className="brand" title={t(lang, "ValueLens by Lindström")}>
          <span className="logoclip">
            <img src="/lindstrom-logo.png" alt="Lindström" />
          </span>
          <span className="label product">ValueLens</span>
        </div>
        <div className="customer-select">
          <select
            aria-label={t(lang, "Customer")}
            value={state?.customer_id ?? ""}
            disabled={!meta}
            onChange={(e) => {
              const next = meta?.customers.find((c) => c.customer_id === e.target.value);
              if (next) dispatch({ type: "customer", customer: next });
            }}
          >
            {meta?.customers.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.customer_name}
              </option>
            ))}
          </select>
        </div>
        <div className="navlabel">
          <span className="label">{t(lang, "Dashboard")}</span>
        </div>
        {items.map((item) => (
          <Link key={item.id} href={item.href} title={item.label} className={`item${item.id === current.id ? " on" : ""}`}>
            <Icon page={item.id} />
            <span className="label">{item.label}</span>
            {item.count && <span className="count">{item.count}</span>}
          </Link>
        ))}
        {state && <ExportDeck lang={lang} state={state} onError={setError} />}
        <div className="navfoot label">
          {customer?.industry}
          <br />
          {t(lang, "Synthetic data, 2025")}
        </div>
      </nav>
      <div className="right">
        <header className="top">
          <button
            className="iconbtn"
            title={t(lang, collapsed ? "Expand menu" : "Collapse menu")}
            aria-label={t(lang, collapsed ? "Expand menu" : "Collapse menu")}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 6h18v2H3zm0 5h12v2H3zm0 5h18v2H3z" />
            </svg>
          </button>
          <span className="crumb">
            <b>{customer?.customer_name}</b>
            {site && ` / ${site.site_name}`}
          </span>
          <span className="grow" />
          <span className="seg" role="group" aria-label={t(lang, "Language")}>
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? "on" : ""} aria-pressed={l === lang} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </span>
        </header>
        <main className="main">
          <div className="head">
            <h1>{current.title}</h1>
            {state && meta && <PeriodAndView lang={lang} state={state} dispatch={dispatch} months={meta.months} />}
          </div>
          {site && (
            <div className="filters">
              <span className="sitechip">
                <span className="muted">{t(lang, "Site")}:</span> {site.site_name}
                <button
                  className="chipclear"
                  title={t(lang, "Clear the Site filter")}
                  aria-label={t(lang, "Clear the Site filter")}
                  onClick={() => dispatch({ type: "site", site_id: null })}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" />
                  </svg>
                </button>
              </span>
            </div>
          )}
          {note && <div className="note">{note}</div>}
          {error && <div className="card warn">{error}</div>}
          {state && meta ? (
            <DashboardContext.Provider value={{ lang, state, dispatch, meta }}>{children}</DashboardContext.Provider>
          ) : (
            !error && <p className="muted">{t(lang, "Loading...")}</p>
          )}
        </main>
      </div>
    </div>
  );
}

function PeriodAndView({
  lang,
  state,
  dispatch,
  months,
}: {
  lang: Lang;
  state: PageState;
  dispatch: (action: PageAction) => void;
  months: string[];
}) {
  const month = months.includes(state.period) ? state.period : "";
  return (
    <>
      <span className="seg" role="group">
        {PERIOD_PILLS.map((p) => (
          <button
            key={p.period}
            className={state.period === p.period ? "on" : ""}
            aria-pressed={state.period === p.period}
            onClick={() => dispatch({ type: "period", period: p.period })}
          >
            {p.label}
          </button>
        ))}
      </span>
      <select
        aria-label={t(lang, "Month")}
        className={month ? "on" : ""}
        value={month}
        onChange={(e) => dispatch({ type: "period", period: e.target.value || "2025" })}
      >
        <option value="">{t(lang, "Month")}</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {monthName(lang, m)}
          </option>
        ))}
      </select>
      <span className="grow" />
      <span className="seg" role="group">
        {(["KAM", "Customer"] as const).map((v) => (
          <button
            key={v}
            className={state.view === v ? "on" : ""}
            aria-pressed={state.view === v}
            onClick={() => dispatch({ type: "view", view: v })}
          >
            {t(lang, v === "KAM" ? "KAM view" : "Customer view")}
          </button>
        ))}
      </span>
    </>
  );
}

/**
 * The fired-signal count for the menu, from the Opportunities page data. It follows the Customer, view and Site
 * filter, the same scope as the Optimisation potential count. A count for another Customer, view or Site never shows,
 * so the KAM view's count never shows in the Customer view.
 */
function useFiredCount(state: PageState | null): number | null {
  const [reply, setReply] = useState<{ key: string; count: number } | null>(null);
  const key = state ? JSON.stringify([state.customer_id, state.view, state.site_id]) : null;
  useEffect(() => {
    if (state === null || key === null) return;
    const controller = new AbortController();
    postPage<OpportunitiesPage>("/api/opportunities", pageRequest(state), controller.signal)
      .then((page) => setReply({ key, count: page.fired_count }))
      .catch(() => {
        // The menu shows no count when the request fails. The Opportunities page shows the error.
      });
    return () => controller.abort();
    // The count does not depend on the period or the priorities.
  }, [key]);
  return reply !== null && reply.key === key ? reply.count : null;
}

/** The language, read from localStorage after the first render and saved there on every change. */
function useLang(): [Lang, (lang: Lang) => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "sv" || saved === "fi") setLang(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return [
    lang,
    (next) => {
      localStorage.setItem(LANG_KEY, next);
      setLang(next);
    },
  ];
}

const ICONS: Record<PageId, string> = {
  overview: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z",
  sites: "M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z",
  opportunities: "M3 17l6-6 4 4 8-8v6h2V3h-10v2h6l-6 6-4-4-8 8z",
  priorities: "M3 5h12v2H3zm0 6h8v2H3zm0 6h4v2H3zm14-6l4 4-4 4v-3h-4v-2h4z",
  data: "M12 3C7 3 3 4.8 3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7c0-2.2-4-4-9-4zm0 2c4 0 7 1.3 7 2s-3 2-7 2-7-1.3-7-2 3-2 7-2z",
};

function Icon({ page }: { page: PageId }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={ICONS[page]} />
    </svg>
  );
}
