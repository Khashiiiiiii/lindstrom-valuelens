// POST /api/data: the Data and assumptions page data for a page request (#32).

import { dataPage } from "../../../lib/pages/data.ts";
import { pageRoute } from "../../../lib/pages/request.ts";

export const POST = pageRoute(dataPage);
