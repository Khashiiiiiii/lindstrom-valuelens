// POST /api/deck: the review as a PowerPoint deck for a page request and the app language (#36). The deck always
// follows the Customer view, whatever view the body names.

import { deckFile, deckFileName, parseDeckRequest } from "../../../lib/pages/deck.ts";
import { BadRequest } from "../../../lib/pages/request.ts";

const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** The .pptx file, or 400 with `{ error: { code: "bad_request", message } }` for a body that is not a deck request. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new BadRequest("The body must be JSON.");
    });
    const deck = parseDeckRequest(body);
    return new Response(await deckFile(deck), {
      headers: {
        "content-type": PPTX,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(deckFileName(deck))}`,
      },
    });
  } catch (error) {
    if (!(error instanceof BadRequest)) throw error;
    return Response.json({ error: { code: "bad_request", message: error.message } }, { status: 400 });
  }
}
