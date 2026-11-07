// The UI language layer for English, Swedish and Finnish, shared by the dashboard and the PowerPoint deck builder
// (#25). The strings are in i18n/dictionary.ts. The data/processed JSON stays English.
//
// t takes a dictionary key for the UI's own text, so tsc rejects a misspelled key. dataLabel takes a value read from
// data/processed, such as a KPI name or a breakdown key. Caveats, transparency texts, the suggested prompts and
// assistant replies are English only and go through neither.

import type { Entry, Plural, Text } from "./i18n/dictionary.ts";
import { DICTIONARY } from "./i18n/dictionary.ts";

export { AI_TRANSLATION_NOTE } from "./i18n/dictionary.ts";

export type Lang = "en" | "sv" | "fi";

/** A key of the dictionary. */
export type DictionaryKey = keyof typeof DICTIONARY;

/** A key with "one" and "other" forms in at least one language. */
type PluralKey = {
  [K in DictionaryKey]: [Extract<(typeof DICTIONARY)[K][keyof (typeof DICTIONARY)[K]], Plural>] extends [never] ? never : K;
}[DictionaryKey];

type Vars = Record<string, string | number>;

/** The vars of t: a key with plural forms needs the count as a number in `n`. */
type VarsFor<K extends DictionaryKey> = K extends PluralKey ? [vars: Vars & { n: number }] : [vars?: Vars];

/** The same entries, looked up by a string that may not be a key. */
const ENTRIES: Record<string, Entry | undefined> = DICTIONARY;

const LOCALES: Record<Lang, string> = { en: "en-GB", sv: "sv-SE", fi: "fi-FI" };

/** A JSON id such as "energy_recovery" or "SYNTHETIC_ESTIMATE": letters and digits joined by underscores. */
const SNAKE_ID = /^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/;

/**
 * The text for a key in the language. A missing SV or FI text falls back to the English text, which is the key
 * itself unless the entry sets `en`. For a key with plural forms, the number in `vars.n` picks the "one" or "other"
 * form. Number vars are formatted for the locale.
 */
export function t<K extends DictionaryKey>(lang: Lang, key: K, ...[vars]: VarsFor<K>): string {
  let out = lookup(lang, key, vars?.n, key);
  for (const [name, value] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{${name}}`, typeof value === "number" ? formatNumber(lang, value) : value);
  }
  return out;
}

/**
 * The text for a value from data/processed, such as a KPI name or a breakdown key, in the language. A value with no
 * entry shows in English. A data id with no entry reads as words, so "unknown_route" shows as "Unknown route". For
 * a unit, the number n, such as a KpiResult value, picks the "one" or "other" form. With no number it is "other".
 */
export function dataLabel(lang: Lang, value: string, n?: number | null): string {
  const english = ENTRIES[value] === undefined && SNAKE_ID.test(value) ? idAsWords(value) : value;
  return lookup(lang, value, n ?? undefined, english);
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

/** The entry's text in the language, else its English text, else `english` for a key with no entry. */
function lookup(lang: Lang, key: string, n: string | number | undefined, english: string): string {
  const entry = ENTRIES[key];
  if (entry === undefined || (lang !== "en" && entry[lang] === undefined)) reportMissing(lang, key);
  return pluralForm(lang, entry?.[lang] ?? entry?.en ?? english, n);
}

/** The "one" form if Intl.PluralRules puts the number n in "one", else the "other" form. */
function pluralForm(lang: Lang, text: Text, n: string | number | undefined): string {
  if (typeof text === "string") return text;
  return typeof n === "number" && new Intl.PluralRules(LOCALES[lang]).select(n) === "one" ? text.one : text.other;
}

function idAsWords(id: string): string {
  const text = id.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const reported = new Set<string>();
let pending: string[] = [];

/**
 * In development, one console warning per tick lists the keys and data values shown in English: those with no
 * entry in any language, and those with no SV or FI text.
 */
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
