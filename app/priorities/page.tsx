"use client";

// The Priorities page (#29): the chosen Customer priorities in order with up, down and remove buttons, chips that
// add the others, and "Reset to default". A change goes into the page state at once, so every page follows it with
// no Save button. The list is client state only and is never stored (#13).

import type { CustomerPriorityId } from "../../lib/data.ts";
import { t } from "../../lib/i18n.ts";
import { useDashboard } from "../shell.tsx";
import { priorityEditor } from "./priority-editor.ts";

/** The Priorities page for the page state, in the app language. */
export default function Priorities() {
  const { lang, meta, state, dispatch } = useDashboard();
  const editor = priorityEditor(lang, meta, state);
  const set = (priorities: CustomerPriorityId[]) => dispatch({ type: "priorities", priorities });
  return (
    <div className="priorities">
      <div className="card">
        {editor.rows.length > 0 ? (
          <ol className="plist">
            {editor.rows.map((row) => (
              <li key={row.id} className={row.in_blocks ? "in-blocks" : ""}>
                <span className="num">{row.position}</span>
                <span className="pname">{row.name}</span>
                <button
                  disabled={row.up === null}
                  onClick={() => row.up && set(row.up)}
                  title={t(lang, "Move {x} up", { x: row.name })}
                  aria-label={t(lang, "Move {x} up", { x: row.name })}
                >
                  &uarr;
                </button>
                <button
                  disabled={row.down === null}
                  onClick={() => row.down && set(row.down)}
                  title={t(lang, "Move {x} down", { x: row.name })}
                  aria-label={t(lang, "Move {x} down", { x: row.name })}
                >
                  &darr;
                </button>
                <button
                  onClick={() => set(row.remove)}
                  title={t(lang, "Remove {x}", { x: row.name })}
                  aria-label={t(lang, "Remove {x}", { x: row.name })}
                >
                  &times;
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t(lang, "No priorities chosen. The Overview shows no priority blocks.")}</p>
        )}
        {editor.chips.length > 0 && (
          <div className="chips">
            <span className="muted">{t(lang, "Add:")}</span>
            {editor.chips.map((chip) => (
              <button
                key={chip.id}
                className="chip"
                onClick={() => set(chip.add)}
                aria-label={t(lang, "Add {x}", { x: chip.name })}
              >
                + {chip.name}
              </button>
            ))}
          </div>
        )}
        <p className="muted">
          {t(lang, "The first 3 make the priority blocks.")}{" "}
          <button className="linkbtn" onClick={() => set(editor.reset)}>
            {t(lang, "Reset to default")}
          </button>
        </p>
      </div>
    </div>
  );
}
