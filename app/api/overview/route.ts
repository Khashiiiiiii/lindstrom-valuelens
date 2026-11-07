// POST /api/overview: the Overview page data for a page request (#26).

import { overviewPage } from "../../../lib/pages/overview.ts";
import { pageRoute } from "../../../lib/pages/request.ts";

export const POST = pageRoute(overviewPage);
