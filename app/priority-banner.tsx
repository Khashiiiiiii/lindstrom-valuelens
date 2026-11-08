// "Priorities changed by the assistant. Undo." (#35). The shell shows it on the page and the assistant shows it in
// the modal, while the page state holds the list from before the assistant's change.

import type { Lang } from "../lib/i18n.ts";
import { t } from "../lib/i18n.ts";

/** The banner text and an Undo button that calls onUndo. */
export function PriorityBanner({ lang, onUndo }: { lang: Lang; onUndo: () => void }) {
  return (
    <div className="banner" role="status">
      <span>{t(lang, "Priorities changed by the assistant.")}</span>
      <button onClick={onUndo}>{t(lang, "Undo")}</button>
    </div>
  );
}
