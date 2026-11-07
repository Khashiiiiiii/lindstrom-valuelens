// POST /api/metadata: the app metadata for a page request (#26).

import { metadataPage } from "../../../lib/pages/metadata.ts";
import { pageRoute } from "../../../lib/pages/request.ts";

export const POST = pageRoute(metadataPage);
