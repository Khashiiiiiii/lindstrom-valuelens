// An Assistant answer as display text in the app language (#34). The answer text and caveats stay English, as the
// spec sets. The figures are the sources' runKpi answers. This module only formats and translates them.

import type { AssistantAnswer } from "../../lib/assistant/contract.ts";
import type { KpiAnswer } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, t } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { BlockFigure, GroupCard } from "../overview/block-cards.ts";
import { groupCard, kpiFigure } from "../overview/block-cards.ts";

/** A source the answer used. A Withheld source has no figure and reads "KAM view only". */
export type SourceCard = ({ withheld: false } & BlockFigure) | { withheld: true; label: string; note: string };

export interface AnswerCard {
  /** The answer text, in English. */
  text: string;
  sources: SourceCard[];
  /** The warning that names the numbers found in no source, or null when there are none. */
  warning: string | null;
  groups: GroupCard[];
}

/** The answer text, its sources, the unmatched-number warning and its signal groups as group cards. */
export function answerCard(lang: Lang, answer: AssistantAnswer, meta: Metadata): AnswerCard {
  return {
    text: answer.answer,
    sources: answer.sources.map((source) => sourceCard(lang, source)),
    warning:
      answer.unmatched_numbers.length === 0
        ? null
        : t(lang, "Numbers not found in the sources: {x}", { x: answer.unmatched_numbers.join(", ") }),
    groups: answer.signal_groups.map((group) => groupCard(lang, group, meta)),
  };
}

/** A source's figure, or for a Withheld source its KPI id as words and "KAM view only". */
export function sourceCard(lang: Lang, source: KpiAnswer): SourceCard {
  if ("withheld" in source) return { withheld: true, label: dataLabel(lang, source.kpi_id), note: t(lang, "KAM view only") };
  return { withheld: false, ...kpiFigure(lang, source) };
}
