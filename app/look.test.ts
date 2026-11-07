import assert from "node:assert/strict";
import { test } from "node:test";

import { lookScript, readLook, saveLook } from "./look.ts";

/** A localStorage stand-in holding the given items. */
function storage(items: Record<string, string> = {}) {
  const map = new Map(Object.entries(items));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

test("with nothing saved, or a value the app does not know, the look is light and Lindström-style", () => {
  assert.deepEqual(readLook(storage()), { theme: "light", palette: "lindstrom" });
  assert.deepEqual(readLook(storage({ "valuelens.theme": "sepia", "valuelens.palette": "neon" })), {
    theme: "light",
    palette: "lindstrom",
  });
});

test("a saved dark indigo look reads back after a reload", () => {
  const saved = storage();
  saveLook(saved, { theme: "dark", palette: "indigo" });
  assert.deepEqual(readLook(storage(Object.fromEntries(saved.map))), { theme: "dark", palette: "indigo" });
});

/** Run the head script against a stand-in localStorage and <html>, and return the attributes it set. */
function runLookScript(items: Record<string, string>): Record<string, string> {
  const dataset: Record<string, string> = {};
  new Function("localStorage", "document", lookScript())(storage(items), { documentElement: { dataset } });
  return dataset;
}

test("the head script puts the saved look on <html> before the first paint, with the same fallback", () => {
  assert.deepEqual(runLookScript({ "valuelens.theme": "dark", "valuelens.palette": "indigo" }), {
    theme: "dark",
    palette: "indigo",
  });
  assert.deepEqual(runLookScript({ "valuelens.theme": "sepia" }), { theme: "light", palette: "lindstrom" });
});
