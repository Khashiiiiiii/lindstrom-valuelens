"use client";

// A page not built yet. The shell shows its title.

import { t } from "../lib/i18n.ts";
import { useDashboard } from "./shell.tsx";

/** A card that says the page comes later. */
export function Placeholder() {
  const { lang } = useDashboard();
  return <div className="card muted">{t(lang, "This page comes in a later build.")}</div>;
}
