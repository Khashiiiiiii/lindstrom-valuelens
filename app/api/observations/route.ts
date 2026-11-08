// POST /api/observations (#43): up to 3 AI observations from local Qwen in Ollama. ASSISTANT_STUB=1 serves the #34 stub.

import { observationsRoute } from "../../../lib/assistant/route.ts";

export const POST = observationsRoute();
