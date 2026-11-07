// POST /api/assistant (#34): a stub that answers in the contract's shape (#15) until the assistant's route lands.

import { stubAnswer, stubRoute } from "../../../lib/assistant/stub.ts";

export const POST = stubRoute(stubAnswer, 4000);
