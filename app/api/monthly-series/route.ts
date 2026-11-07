// POST /api/monthly-series: the monthly series of the common tiles' KPIs for a page request (#27).

import { seriesPage } from "../../../lib/pages/series.ts";
import { pageRoute } from "../../../lib/pages/request.ts";

export const POST = pageRoute(seriesPage);
