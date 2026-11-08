// POST /api/assistant (#40): an Assistant answer from local Qwen in Ollama. ASSISTANT_STUB=1 serves the #34 stub.

import { assistantRoute } from "../../../lib/assistant/route.ts";

export const POST = assistantRoute();
