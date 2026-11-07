"use client";

// The left menu's PowerPoint export (#36). It posts the page state and the app language to /api/deck and saves the
// returned file. The server builds the deck in the Customer view, whatever view the KAM is in.

import { useState } from "react";

import type { Lang } from "../lib/i18n.ts";
import { t } from "../lib/i18n.ts";
import type { PageState } from "./page-state.ts";
import { pageRequest } from "./page-state.ts";

/** The "Export" menu label and the deck button. A failed export shows its message through onError. */
export function ExportDeck({ lang, state, onError }: { lang: Lang; state: PageState; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function exportDeck() {
    setBusy(true);
    try {
      const response = await fetch("/api/deck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...pageRequest(state), lang }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? `/api/deck answered ${response.status}.`);
      }
      save(await response.blob(), fileName(response) ?? "ValueLens.pptx");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const label = t(lang, busy ? "Building PowerPoint..." : "PowerPoint deck");
  return (
    <>
      <div className="navlabel">
        <span className="label">{t(lang, "Export")}</span>
      </div>
      <button className="item" title={label} aria-busy={busy} disabled={busy} onClick={exportDeck}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M4 3h16v12H4zm2 2v8h12V5zM11 15h2v3h4v2H7v-2h4zM8 7h5v2H8zm0 3h8v1H8z" />
        </svg>
        <span className="label">{label}</span>
        <span className="label ext">{lang.toUpperCase()}</span>
      </button>
    </>
  );
}

/** The file name in the reply's content-disposition header. */
function fileName(response: Response): string | null {
  const match = response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Save the file through a temporary link. */
function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
