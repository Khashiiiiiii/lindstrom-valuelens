// The UI language layer for English, Swedish and Finnish, shared by the dashboard and the PowerPoint deck builder
// (#25). The strings are in i18n/dictionary.ts. The data/processed JSON stays English.

import type { Text } from "./i18n/dictionary.ts";
import { DICTIONARY } from "./i18n/dictionary.ts";

export { AI_TRANSLATION_NOTE } from "./i18n/dictionary.ts";

export type Lang = "en" | "sv" | "fi";

const LOCALES: Record<Lang, string> = { en: "en-GB", sv: "sv-SE", fi: "fi-FI" };

/** The Intl locale for the language: en-GB, sv-SE or fi-FI. */
export function locale(lang: Lang): string {
  return LOCALES[lang];
}

/**
 * The text for a key in the language. A missing SV or FI text falls back to the English text, which is the key
 * itself unless the entry sets `en`. A number in `vars.n` picks the "one" or "other" form. Number vars are
 * formatted for the locale.
 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = DICTIONARY[key];
  if (lang !== "en" && entry?.[lang] === undefined) reportMissing(lang, key);
  const text = entry?.[lang] ?? entry?.en ?? key;
  let out = pick(lang, text, vars?.n);
  for (const [name, value] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{${name}}`, typeof value === "number" ? formatNumber(lang, value) : value);
  }
  return out;
}

/** A number in the language's locale, for example a decimal comma in SV and FI. */
export function formatNumber(lang: Lang, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALES[lang], options).format(value);
}

/** The name of a data month such as "2025-01" in the language's locale. */
export function monthName(lang: Lang, month: string, style: "long" | "short" = "long"): string {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALES[lang], { month: style, timeZone: "UTC" }).format(Date.UTC(year, m - 1, 1));
}

function pick(lang: Lang, text: Text, n: string | number | undefined): string {
  if (typeof text === "string") return text;
  return typeof n === "number" && new Intl.PluralRules(LOCALES[lang]).select(n) === "one" ? text.one : text.other;
}

const reported = new Set<string>();
let pending: string[] = [];

/** In development, one console warning per tick lists the SV and FI keys that fell back to English. */
function reportMissing(lang: Lang, key: string): void {
  if (process.env.NODE_ENV !== "development") return;
  const id = `${lang}: ${key}`;
  if (reported.has(id)) return;
  reported.add(id);
  if (pending.length === 0) {
    queueMicrotask(() => {
      console.warn(`Missing translations, shown in English:\n${pending.join("\n")}`);
      pending = [];
    });
  }
  pending.push(id);
}
