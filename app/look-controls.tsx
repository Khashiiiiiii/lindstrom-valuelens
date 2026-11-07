"use client";

// The top bar's look controls (#33): the light and dark toggle, and the profile menu with the demo KAM's avatar,
// which holds the language, theme and colours. The look itself is in look.ts.

import { useEffect, useRef, useState } from "react";

import { DEMO_KAM } from "../lib/demo-kam.ts";
import type { Lang } from "../lib/i18n.ts";
import { t } from "../lib/i18n.ts";
import type { Look } from "./look.ts";
import { readLook, saveLook } from "./look.ts";

/**
 * The look and a setter. The head script has already put the saved look on <html>, so the page paints in it. The
 * state reads it after the first render, so the server and client renders match.
 */
export function useLook(): [Look, (look: Look) => void] {
  const [look, setLook] = useState<Look>({ theme: "light", palette: "lindstrom" });
  useEffect(() => {
    setLook(readLook(localStorage));
  }, []);
  return [
    look,
    (next) => {
      saveLook(localStorage, next);
      document.documentElement.dataset.theme = next.theme;
      document.documentElement.dataset.palette = next.palette;
      setLook(next);
    },
  ];
}

/**
 * The light and dark toggle. CSS picks the moon or sun icon from <html>, so a reload in dark mode shows the sun at
 * once.
 */
export function ThemeToggle({ lang, look, setLook }: { lang: Lang; look: Look; setLook: (look: Look) => void }) {
  const next = look.theme === "dark" ? "light" : "dark";
  const label = t(lang, next === "dark" ? "Dark" : "Light");
  return (
    <button className="iconbtn" title={label} aria-label={label} onClick={() => setLook({ ...look, theme: next })}>
      <svg className="theme-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.3 2a9 9 0 1 0 9.7 11.6A7.5 7.5 0 0 1 12.3 2z" />
      </svg>
      <svg className="theme-sun" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 2.8l2.1 2.1-1.4 1.4-2.1-2.1zm14.9 14.9 2.1 2.1-1.4 1.4-2.1-2.1zM2.8 19.8l2.1-2.1 1.4 1.4-2.1 2.1zM17.7 4.9l2.1-2.1 1.4 1.4-2.1 2.1z" />
      </svg>
    </button>
  );
}

const LANG_NAMES: [Lang, string][] = [
  ["en", "English"],
  ["sv", "Svenska"],
  ["fi", "Suomi"],
];

/** The avatar button and its menu. A click outside the menu or Escape closes it. */
export function ProfileMenu({
  lang,
  setLang,
  look,
  setLook,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  look: Look;
  setLook: (look: Look) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="prof" ref={ref}>
      <button className="avatar" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Portrait size={34} />
        <span className="who">
          <b>{DEMO_KAM.name}</b>
          <span className="muted">KAM</span>
        </span>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      {open && (
        <div className="profmenu">
          <div className="profhead">
            <Portrait size={44} />
            <div>
              <b>{DEMO_KAM.name}</b>
              <div className="muted">{t(lang, "Key Account Manager")}</div>
              <div className="muted">{DEMO_KAM.email}</div>
            </div>
          </div>
          <Row label={t(lang, "Language")} options={LANG_NAMES} current={lang} onPick={setLang} />
          <Row
            label={t(lang, "Theme")}
            options={[
              ["light", t(lang, "Light")],
              ["dark", t(lang, "Dark")],
            ]}
            current={look.theme}
            onPick={(theme) => setLook({ ...look, theme })}
          />
          <Row
            label={t(lang, "Colours")}
            options={[
              ["lindstrom", t(lang, "Lindström-style")],
              ["indigo", t(lang, "Indigo")],
            ]}
            current={look.palette}
            onPick={(palette) => setLook({ ...look, palette })}
          />
          <button className="signout" disabled>
            {t(lang, "Sign out")}
          </button>
        </div>
      )}
    </div>
  );
}

function Row<K extends string>({
  label,
  options,
  current,
  onPick,
}: {
  label: string;
  options: [K, string][];
  current: K;
  onPick: (key: K) => void;
}) {
  return (
    <div className="profrow">
      <span>{label}</span>
      <span className="seg" role="group" aria-label={label}>
        {options.map(([key, name]) => (
          <button key={key} className={key === current ? "on" : ""} aria-pressed={key === current} onClick={() => onPick(key)}>
            {name}
          </button>
        ))}
      </span>
    </div>
  );
}

/** A drawn avatar for the demo KAM. The project has no photos. */
function Portrait({ size }: { size: number }) {
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="var(--c2)" />
      <path d="M6 37c2-8 7-11 14-11s12 3 14 11a20 20 0 0 1-28 0z" fill="#fff" opacity=".92" />
      <circle cx="20" cy="16" r="7.5" fill="#f3c9a6" />
      <path d="M12.3 15.5c0-5.5 3.5-8.5 7.7-8.5s7.8 3 7.8 8.5c-1.8-2.6-4.3-3.6-7.8-3.6s-6 1-7.7 3.6z" fill="#5b3b28" />
    </svg>
  );
}
