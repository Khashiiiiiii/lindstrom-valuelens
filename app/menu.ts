// The left menu's pages and the shell's translated texts (#26).

import type { DictionaryKey, Lang } from "../lib/i18n.ts";
import { AI_TRANSLATION_NOTE, formatNumber, t } from "../lib/i18n.ts";

export type PageId = "overview" | "sites" | "opportunities" | "priorities" | "data";

const PAGES: { id: PageId; href: string; label: DictionaryKey; title: DictionaryKey }[] = [
  { id: "overview", href: "/overview", label: "Overview", title: "Overview" },
  { id: "sites", href: "/sites", label: "Sites", title: "Sites" },
  { id: "opportunities", href: "/opportunities", label: "Opportunities", title: "Opportunities" },
  { id: "priorities", href: "/priorities", label: "Priorities", title: "Customer priorities" },
  { id: "data", href: "/data", label: "Data and assumptions", title: "Data and assumptions" },
];

export interface MenuItem {
  id: PageId;
  href: string;
  label: string;
  title: string;
  /** The count next to the label: the fired-signal count on Opportunities, else null. */
  count: string | null;
}

/**
 * The menu items in menu order, with the menu label and the page title in the language. firedCount is the
 * Opportunities page data's fired count, or null until it loads. A count of 0 does not show.
 */
export function menuItems(lang: Lang, firedCount: number | null = null): MenuItem[] {
  return PAGES.map((p) => ({
    id: p.id,
    href: p.href,
    label: t(lang, p.label),
    title: t(lang, p.title),
    count: p.id === "opportunities" && firedCount ? formatNumber(lang, firedCount) : null,
  }));
}

/** The "AI translation" note in SV and FI. English needs none. */
export function translationNote(lang: Lang): string | null {
  return lang === "en" ? null : t(lang, AI_TRANSLATION_NOTE);
}
