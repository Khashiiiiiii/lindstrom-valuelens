// POST /api/sites: the Sites page data for a page request (#30).

import { sitesPage } from "../../../lib/pages/sites.ts";
import { pageRoute } from "../../../lib/pages/request.ts";

export const POST = pageRoute(sitesPage);
