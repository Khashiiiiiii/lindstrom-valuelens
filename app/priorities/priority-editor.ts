// The Priorities page's editor (#29): the chosen Customer priorities in order, the chips that add the others, and
// the Customer's default priorities for "Reset to default". The list is client state only and is never stored (#13).

import type { CustomerPriorityId } from "../../lib/data.ts";
import { dataLabel } from "../../lib/i18n.ts";
import type { Lang } from "../../lib/i18n.ts";
import type { Metadata } from "../../lib/pages/metadata.ts";
import type { PageState } from "../page-state.ts";

/** How many priorities make the Overview priority blocks. */
const BLOCK_COUNT = 3;

export interface PriorityRow {
  id: CustomerPriorityId;
  name: string;
  /** 1 for the first priority. */
  position: number;
  /** True for the first 3, which make the priority blocks. */
  in_blocks: boolean;
  /** The list with this priority one place up, or null for the first. */
  up: CustomerPriorityId[] | null;
  /** The list with this priority one place down, or null for the last. */
  down: CustomerPriorityId[] | null;
  /** The list without this priority. */
  remove: CustomerPriorityId[];
}

/** A chip that adds a priority not chosen yet to the end of the list. */
export interface PriorityChip {
  id: CustomerPriorityId;
  name: string;
  /** The list with this priority added last. */
  add: CustomerPriorityId[];
}

export interface PriorityEditor {
  rows: PriorityRow[];
  /** The priorities not chosen, in catalogue order. */
  chips: PriorityChip[];
  /** The Customer's default priorities (ADR 0006), which "Reset to default" restores. */
  reset: CustomerPriorityId[];
}

/** The editor for the state's Customer and priority list, in the language. */
export function priorityEditor(
  lang: Lang,
  meta: Metadata,
  state: Pick<PageState, "customer_id" | "priorities">,
): PriorityEditor {
  const name = (id: CustomerPriorityId) => dataLabel(lang, meta.priorities.find((p) => p.id === id)?.name ?? id);
  return {
    rows: state.priorities.map((id, i) => ({
      id,
      name: name(id),
      position: i + 1,
      in_blocks: i < BLOCK_COUNT,
      up: i === 0 ? null : swap(state.priorities, i - 1),
      down: i === state.priorities.length - 1 ? null : swap(state.priorities, i),
      remove: state.priorities.filter((other) => other !== id),
    })),
    chips: meta.priorities
      .filter((p) => !state.priorities.includes(p.id))
      .map((p) => ({ id: p.id, name: name(p.id), add: [...state.priorities, p.id] })),
    reset: [...(meta.customers.find((c) => c.customer_id === state.customer_id)?.default_priorities ?? [])],
  };
}

/** The list with the priorities at i and i + 1 swapped. */
function swap(list: readonly CustomerPriorityId[], i: number): CustomerPriorityId[] {
  const next = [...list];
  [next[i], next[i + 1]] = [next[i + 1], next[i]];
  return next;
}
