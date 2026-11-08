"use client";

// The round AI button and the assistant modal (#34, #35). The Ask tab posts to /api/assistant and the Observations
// tab to /api/observations, in the contract's shapes (#15). One request runs at a time. A reply's priority_change
// applies to the page at once, with Undo. A view or Customer change clears the modal and drops a pending reply. The
// state rules are in assistant-state.ts and the display text in answer-cards.ts.

import "./assistant.css";

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";

import type {
  AssistantAnswer,
  AssistantError,
  AssistantFailure,
  AssistantRequest,
  ObservationsReply,
  ObservationsRequest,
} from "../../lib/assistant/contract.ts";
import { SUGGESTED_PROMPTS } from "../../lib/assistant/contract.ts";
import type { Lang } from "../../lib/i18n.ts";
import { monthName, t } from "../../lib/i18n.ts";
import { translationNote } from "../menu.ts";
import type { PageState } from "../page-state.ts";
import { pageRequest } from "../page-state.ts";
import { PriorityBanner } from "../priority-banner.tsx";
import { errorMessage, useDashboard } from "../shell.tsx";
import type { AnswerCard, SourceCard } from "./answer-cards.ts";
import { answerCard, observationCard } from "./answer-cards.ts";
import type { AssistantAction, AssistantTab } from "./assistant-state.ts";
import { assistantState, initialState, inScope, workingSeconds } from "./assistant-state.ts";

const TABS: { tab: AssistantTab; label: "Ask" | "Observations" }[] = [
  { tab: "ask", label: "Ask" },
  { tab: "observations", label: "Observations" },
];

/** The AI button at the bottom right and, when it is open, the modal over the page. */
export function Assistant() {
  const { lang, state: page, dispatch: pageDispatch, meta } = useDashboard();
  const [state, dispatch] = useReducer(assistantState, page, initialState);
  // The answer and observations belong to one Customer and view. A switch clears them during this render, so a
  // KAM-only answer never shows in the Customer view, not even for one frame.
  if (!inScope(state, page)) dispatch({ type: "scope", customer_id: page.customer_id, view: page.view });
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(0);
  const lastId = useRef(0);
  const running = useRef<AbortController | null>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const busy = state.pending !== null;

  // A view or Customer switch also aborts the running request, so the model stops work on a reply that would be
  // dropped. The cleanup runs when either changes, and when the shell unmounts.
  useEffect(() => () => running.current?.abort(), [page.customer_id, page.view]);

  // The counter ticks once a second while a request runs.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // Escape closes the modal.
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "close" });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [state.open]);

  // The prompt box takes the focus when the modal opens, when the Ask tab opens and when a reply arrives.
  useEffect(() => {
    if (state.open && !busy) promptBox.current?.focus();
  }, [state.open, busy, state.tab]);

  // A reply's priority_change applies to the page before the answer paints. The reducer drops a reply that a view or
  // Customer change made stale, so its change never applies. The page state drops a change built from a list the
  // user edited while the request ran. A new answer is a new object, so each change applies once.
  useLayoutEffect(() => {
    const change = state.answer?.priority_change;
    if (change && state.asked_priorities) {
      pageDispatch({ type: "assistant_priorities", priorities: change.priorities, from: state.asked_priorities });
    }
    // pageDispatch is the shell's reducer dispatch, which never changes. asked_priorities changes with the answer.
  }, [state.answer]);

  /** Names a request, starts the counter and sends it. Its reply or error is matched to it by request_id. */
  function send<R extends AssistantRoute>(
    route: R,
    body: AssistantRoutes[R]["request"],
    start: (request_id: number, at: number) => AssistantAction,
    reply: (data: AssistantRoutes[R]["reply"], request_id: number) => AssistantAction,
  ) {
    const request_id = ++lastId.current;
    const at = Date.now();
    setNow(at);
    dispatch(start(request_id, at));
    const controller = new AbortController();
    running.current = controller;
    postJson(route, body, controller.signal).then(
      (data) => dispatch(reply(data, request_id)),
      (error: AssistantFailure) => dispatch({ type: "failed", request_id, error }),
    );
  }

  function ask(prompt: string) {
    const text = prompt.trim();
    if (busy || text === "") return;
    setDraft("");
    const body = assistantRequest(text, page);
    send(
      "/api/assistant",
      body,
      (request_id, at) => ({ type: "ask", prompt: text, priorities: body.priorities, request_id, at }),
      (answer, request_id) => ({ type: "answer", request_id, answer }),
    );
  }

  function observe() {
    if (busy) return;
    send(
      "/api/observations",
      observationsRequest(page),
      (request_id, at) => ({ type: "observe", request_id, at }),
      (data, request_id) => ({ type: "observations", request_id, observations: data.observations }),
    );
  }

  const customer = meta.customers.find((c) => c.customer_id === page.customer_id);
  const site = meta.sites.find((s) => s.site_id === page.site_id);
  const card = state.answer && answerCard(lang, state.answer, meta);
  // The counter shows on the tab whose request runs. The FAB ring shows on every tab.
  const working = (kind: "ask" | "observe") =>
    state.pending?.kind === kind && <div className="ai-working">{t(lang, "Working... {n} s", { n: workingSeconds(state, now) })}</div>;
  const note = translationNote(lang);
  const title = t(lang, "AI assistant");

  return (
    <>
      {state.open && (
        <>
          <div className="ai-backdrop" onClick={() => dispatch({ type: "close" })} />
          <div className="ai-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="ai-head">
              <span className="ai-logo">
                <AiIcon />
              </span>
              <b>{title}</b>
              <span className="grow" />
              <span className="seg" role="tablist">
                {TABS.map(({ tab, label }) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={state.tab === tab}
                    className={state.tab === tab ? "on" : ""}
                    onClick={() => dispatch({ type: "tab", tab })}
                  >
                    {t(lang, label)}
                  </button>
                ))}
              </span>
              <button className="ai-x" aria-label={t(lang, "Close")} title={t(lang, "Close")} onClick={() => dispatch({ type: "close" })}>
                &times;
              </button>
            </div>
            <div className="ai-body" aria-live="polite">
              {note && <div className="note">{note}</div>}
              {page.undo_priorities && <PriorityBanner lang={lang} onUndo={() => pageDispatch({ type: "undo" })} />}
              {state.tab === "ask" ? (
                <>
                  <div className="muted">{t(lang, "Try one of these:")}</div>
                  <div className="chips">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button key={p} className="chip" disabled={busy} onClick={() => ask(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {state.prompt !== null && (state.pending?.kind === "ask" || state.answer || state.error) && (
                    <div className="ai-bubble me">{state.prompt}</div>
                  )}
                  {working("ask")}
                  {state.error && <Failure lang={lang} error={state.error} onRetry={() => state.prompt !== null && ask(state.prompt)} />}
                  {card && <Answer lang={lang} card={card} />}
                </>
              ) : (
                <>
                  <div className="ai-row">
                    <button className="primary" disabled={busy} onClick={observe}>
                      {t(lang, "Generate observations")}
                    </button>
                    {working("observe")}
                  </div>
                  {state.observations_error && <Failure lang={lang} error={state.observations_error} onRetry={observe} />}
                  {state.observations === null
                    ? state.pending?.kind !== "observe" && !state.observations_error && (
                        <div className="muted">{t(lang, 'No AI observations yet. They appear only when you click "Generate observations".')}</div>
                      )
                    : state.observations.map((o, i) => (
                        <div key={i} className="ai-observation">
                          <div className="figlabel">{t(lang, "AI observation {n}", { n: String(i + 1) })}</div>
                          <Answer lang={lang} card={observationCard(lang, o, meta)} />
                        </div>
                      ))}
                </>
              )}
            </div>
            <div className="ai-foot">
              {state.tab === "ask" && (
              <div className="ai-row">
                <textarea
                  ref={promptBox}
                  rows={2}
                  value={draft}
                  disabled={busy}
                  aria-label={title}
                  placeholder={t(lang, "Ask about {x}...", { x: customer?.customer_name ?? page.customer_id })}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(draft);
                    }
                  }}
                />
                <button className="primary" disabled={busy || draft.trim() === ""} onClick={() => ask(draft)}>
                  {t(lang, "Ask")}
                </button>
              </div>
              )}
              <div className="muted ai-context">
                {[t(lang, page.view === "KAM" ? "KAM view" : "Customer view"), periodName(lang, page.period), site?.site_name]
                  .filter(Boolean)
                  .join(", ")}
                .{state.tab === "ask" && ` ${t(lang, "Each question stands alone.")}`}
              </div>
            </div>
          </div>
        </>
      )}
      <button
        className={`ai-fab${busy ? " busy" : ""}${state.open ? " open" : ""}`}
        aria-label={title}
        title={title}
        aria-expanded={state.open}
        onClick={() => dispatch({ type: state.open ? "close" : "open" })}
      >
        <AiIcon />
        {state.unread && <span className="ai-dot" />}
      </button>
    </>
  );
}

/** The answer bubble, the unmatched-number warning, the sources and the signal group cards. */
function Answer({ lang, card }: { lang: Lang; card: AnswerCard }) {
  return (
    <>
      <div className="ai-bubble">{card.text}</div>
      {card.warning && <div className="card warn">{card.warning}</div>}
      {card.sources.length > 0 && (
        <details className="ai-sources" open>
          <summary>{t(lang, "{n} source(s)", { n: card.sources.length })}</summary>
          {card.sources.map((s, i) => (
            <Source key={i} lang={lang} source={s} />
          ))}
        </details>
      )}
      {card.groups.map((g) => (
        <div key={g.name} className="card ai-group">
          <b>{g.name}</b>
          <div>
            <span className="muted">{t(lang, "Lever")}: </span>
            {g.lever}
          </div>
          <div className="muted">{g.owner}</div>
          <div className="muted">{g.sites.join(", ")}</div>
        </div>
      ))}
    </>
  );
}

/** A failed request's message and "Try again". */
function Failure({ lang, error, onRetry }: { lang: Lang; error: AssistantFailure; onRetry: () => void }) {
  return (
    <div className="card warn ai-error">
      <span>{error.message}</span>
      <button onClick={onRetry}>{t(lang, "Try again")}</button>
    </div>
  );
}

function Source({ lang, source }: { lang: Lang; source: SourceCard }) {
  if (source.withheld) {
    return (
      <div className="ai-source">
        <span className="figlabel">{source.label}</span> <span className="badge kam">{source.note}</span>
      </div>
    );
  }
  return (
    <div className="ai-source">
      <div className="figlabel">{source.label}</div>
      <div>
        <b>{source.value}</b> {source.unit && <span className="unit">{source.unit}</span>} <span className="badge">{source.data_status}</span>
        {source.baseline && <span className="muted"> {source.baseline}</span>}
      </div>
      {source.caveats.length > 0 && (
        <details className="caveats">
          <summary>{t(lang, "{n} caveat(s)", { n: source.caveats.length })}</summary>
          {source.caveats.map((c) => (
            <div key={c} className="caveat">
              {c}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** The request body for a prompt and the page state. */
function assistantRequest(prompt: string, page: PageState): AssistantRequest {
  return { ...observationsRequest(page), prompt };
}

/** The request body for "Generate observations" and the page state. */
function observationsRequest(page: PageState): ObservationsRequest {
  return { ...pageRequest(page), priorities: page.priorities };
}

/** Each assistant route's request and reply body, from the contract (#15). */
interface AssistantRoutes {
  "/api/assistant": { request: AssistantRequest; reply: AssistantAnswer };
  "/api/observations": { request: ObservationsRequest; reply: ObservationsReply };
}

type AssistantRoute = keyof AssistantRoutes;

/** POST to an assistant route. Rejects with the reply's error, or a model_error when the reply holds none. */
async function postJson<R extends AssistantRoute>(
  route: R,
  body: AssistantRoutes[R]["request"],
  signal: AbortSignal,
): Promise<AssistantRoutes[R]["reply"]> {
  let response: Response;
  try {
    response = await fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    throw { code: "model_error", message: errorMessage(e) } satisfies AssistantFailure;
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return json as AssistantRoutes[R]["reply"];
  const error = (json as Partial<AssistantError> | null)?.error;
  throw (error ?? { code: "model_error", message: `${route} answered ${response.status}.` }) satisfies AssistantFailure;
}

/** The period as the period pills name it: a month name, "H1 2025", "H2 2025" or "2025". */
function periodName(lang: Lang, period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return `${monthName(lang, period)} ${period.slice(0, 4)}`;
  const half = /^(\d{4})-(H[12])$/.exec(period);
  return half ? `${half[2]} ${half[1]}` : period;
}

function AiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 4.9L19 8.7l-5.2 1.8L12 15.4l-1.8-4.9L5 8.7l5.2-1.8zM19 14l.9 2.4 2.4.9-2.4.9L19 20.6l-.9-2.4-2.4-.9 2.4-.9zM6 15l.7 1.8 1.8.7-1.8.7L6 20l-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}
