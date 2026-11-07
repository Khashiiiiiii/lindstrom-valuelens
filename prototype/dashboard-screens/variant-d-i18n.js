// PROTOTYPE, throw me away. UI language for variant D: English, Swedish, Finnish.
// Draft wording by the agent, not checked by a native speaker or against Lindström's own terms.
// Keys are the English strings. Anything missing falls back to English, so caveats, signal texts,
// levers and assistant answers stay English for now.

const UI = Object.assign(
  { lang: "en", theme: "light", palette: "lindstrom", collapsed: false },
  JSON.parse(localStorage.getItem("proto-ui") || "{}"),
);
function saveUI(patch) { Object.assign(UI, patch); localStorage.setItem("proto-ui", JSON.stringify(UI)); render(); }
const D_LOCALE = () => ({ en: "en-GB", sv: "sv-SE", fi: "fi-FI" })[UI.lang];
const isD = () => typeof S !== "undefined" && S.variant === "D";

// tr("Text") or tr("{n} source(s)", { n: 3 }). Only variant D translates; A, B and C stay English.
function tr(s, vars) {
  let out = (isD() && I18N[UI.lang][s]) || s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
}
