"use client";

// The round AI button and the assistant modal's Ask tab (#34). The modal posts to /api/assistant in the contract's
// shapes (#15). One request runs at a time. The state rules are in assistant-state.ts and the display text in
// answer-cards.ts.

import "./assistant.css";

import { useEffect, useReducer, useRef, useState } from "react";

import type { AssistantAnswer, AssistantError, AssistantFailure, AssistantRequest } from "../../lib/assistant/contract.ts";
import { SUGGESTED_PROMPTS } from "../../lib/assistant/contract.ts";
import type { Lang } from "../../lib/i18n.ts";
import { monthName, t } from "../../lib/i18n.ts";
import { translationNote } from "../menu.ts";
import type { PageState } from "../page-state.ts";
import { pageRequest } from "../page-state.ts";
import { errorMessage, useDashboard } from "../shell.tsx";
import type { AnswerCard, SourceCard } from "./answer-cards.ts";
import { answerCard } from "./answer-cards.ts";
import { assistantState, INITIAL, workingSeconds } from "./assistant-state.ts";

/** The AI button at the bottom right and, when it is open, the modal over the page. */
export function Assistant() {
  const { lang, state: page, meta } = useDashboard();
  const [state, dispatch] = useReducer(assistantState, INITIAL);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(0);
  const lastId = useRef(0);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const busy = state.pending !== null;

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

  // The prompt box takes the focus when the modal opens and when a reply arrives.
  useEffect(() => {
    if (state.open && !busy) promptBox.current?.focus();
  }, [state.open, busy]);

  function ask(prompt: string) {
    if (busy || prompt.trim() === "") return;
    const request_id = ++lastId.current;
    const at = Date.now();
    setNow(at);
    setDraft("");
    dispatch({ type: "ask", prompt, request_id, at });
    postAssistant(assistantRequest(prompt.trim(), page)).then(
      (answer) => dispatch({ type: "answer", request_id, answer }),
      (error: AssistantFailure) => dispatch({ type: "failed", request_id, error }),
    );
  }

  const customer = meta.customers.find((c) => c.customer_id === page.customer_id);
  const site = meta.sites.find((s) => s.site_id === page.site_id);
  const card = state.answer && answerCard(lang, state.answer, meta);
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
              <button className="ai-x" aria-label={t(lang, "Close")} title={t(lang, "Close")} onClick={() => dispatch({ type: "close" })}>
                &times;
              </button>
            </div>
            <div className="ai-body" aria-live="polite">
              {note && <div className="note">{note}</div>}
              <div className="muted">{t(lang, "Try one of these:")}</div>
              <div className="chips">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button key={p} className="chip" disabled={busy} onClick={() => ask(p)}>
                    {p}
                  </button>
                ))}
              </div>
              {state.prompt !== null && (busy || state.answer || state.error) && <div className="ai-bubble me">{state.prompt}</div>}
              {busy && <div className="ai-working">{t(lang, "Working... {n} s", { n: workingSeconds(state, now) })}</div>}
              {state.error && (
                <div className="card warn ai-error">
                  <span>{state.error.message}</span>
                  <button onClick={() => state.prompt !== null && ask(state.prompt)}>{t(lang, "Try again")}</button>
                </div>
              )}
              {card && <Answer lang={lang} card={card} />}
            </div>
            <div className="ai-foot">
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
              <div className="muted ai-context">
                {[t(lang, page.view === "KAM" ? "KAM view" : "Customer view"), periodName(lang, page.period), site?.site_name]
                  .filter(Boolean)
                  .join(", ")}
                . {t(lang, "Each question stands alone.")}
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
  return { ...pageRequest(page), prompt, priorities: page.priorities };
}

/** POST /api/assistant. Rejects with the reply's error, or a model_error when the reply holds none. */
async function postAssistant(body: AssistantRequest): Promise<AssistantAnswer> {
  let response: Response;
  try {
    response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    throw { code: "model_error", message: errorMessage(e) } satisfies AssistantFailure;
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return json as AssistantAnswer;
  const error = (json as Partial<AssistantError> | null)?.error;
  throw (error ?? { code: "model_error", message: `/api/assistant answered ${response.status}.` }) satisfies AssistantFailure;
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
