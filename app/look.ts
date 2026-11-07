// The look the KAM picks in the profile menu (#33): a light or dark theme and the Lindström-style or indigo
// colours. Both persist in localStorage.

export type Theme = "light" | "dark";
export type Palette = "lindstrom" | "indigo";

export interface Look {
  theme: Theme;
  palette: Palette;
}

const THEME_KEY = "valuelens.theme";
const PALETTE_KEY = "valuelens.palette";

/** The saved look. A missing or unknown value falls back to light and Lindström-style. */
export function readLook(storage: Pick<Storage, "getItem">): Look {
  return {
    theme: storage.getItem(THEME_KEY) === "dark" ? "dark" : "light",
    palette: storage.getItem(PALETTE_KEY) === "indigo" ? "indigo" : "lindstrom",
  };
}

/** Save the look, so it survives a reload. */
export function saveLook(storage: Pick<Storage, "setItem">, look: Look): void {
  storage.setItem(THEME_KEY, look.theme);
  storage.setItem(PALETTE_KEY, look.palette);
}

/**
 * A script for <head> that puts the saved look on <html> as data-theme and data-palette before the first paint,
 * so a reload in dark mode never shows the light page first. It repeats readLook's fallback in plain JS.
 */
export function lookScript(): string {
  return `try {
  var root = document.documentElement.dataset;
  root.theme = localStorage.getItem(${JSON.stringify(THEME_KEY)}) === "dark" ? "dark" : "light";
  root.palette = localStorage.getItem(${JSON.stringify(PALETTE_KEY)}) === "indigo" ? "indigo" : "lindstrom";
} catch (e) {}`;
}
