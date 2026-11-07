// The Overview page data (#26): the first screen for the request. Every figure is a runKpi answer from firstScreen
// (ADR 0001).

import type { FirstScreenResult } from "../data.ts";
import { firstScreen } from "../data.ts";
import type { PageRequest } from "./request.ts";

export type OverviewPage = FirstScreenResult;

/** The first screen for the request's Customer, Site, period, view and priorities. */
export function overviewPage(request: PageRequest): OverviewPage {
  return firstScreen(request);
}
