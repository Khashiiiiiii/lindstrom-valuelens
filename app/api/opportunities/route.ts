// POST /api/opportunities: the Opportunities page data for a page request (#31). The shell also reads its fired
// count for the menu.

import { opportunitiesPage } from "../../../lib/pages/opportunities.ts";
import { pageRoute } from "../../../lib/pages/request.ts";

export const POST = pageRoute(opportunitiesPage);
