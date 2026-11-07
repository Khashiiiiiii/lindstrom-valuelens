// POST /api/observations (#34): a stub that answers in the contract's shape (#15) until the assistant's route lands.

import { stubObservations, stubRoute } from "../../../lib/assistant/stub.ts";

export const POST = stubRoute(stubObservations, 5000);
