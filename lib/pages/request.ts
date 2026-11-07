// The body of every page data route (#23): one Customer, an optional Site, a period, a view and the priority list.
// The view comes from the dashboard's toggle and goes to every calculation call (ADR 0001).

import type { Period, Scope } from "../data.ts";
import { periodMonths, resolvePriorities, resolveScope } from "../data.ts";

export interface PageRequest {
  customer_id: string;
  /** Must belong to customer_id, else the request is a bad request. */
  site_id?: string;
  period: Period;
  view: "KAM" | "Customer";
  /** Priority names or ids, in order. Missing means the Customer's default priorities. */
  priorities?: string[];
}

/** The request's scope: the Site when site_id is set, else the whole Customer. */
export function pageScope({ customer_id, site_id }: PageRequest): Scope {
  return site_id === undefined ? { customer_id } : { customer_id, site_id };
}

/** A request the routes answer with 400. The message says what is wrong. */
export class BadRequest extends Error {}

/**
 * The page request in a route body. Throws BadRequest on a body of the wrong shape, an unknown Customer, Site,
 * period or priority, and a Site of another Customer.
 */
export function parsePageRequest(body: unknown): PageRequest {
  if (typeof body !== "object" || body === null) throw new BadRequest("The body must be a JSON object.");
  const { customer_id, site_id, period, view, priorities } = body as Record<string, unknown>;
  if (typeof customer_id !== "string") throw new BadRequest("customer_id must be a string.");
  if (site_id !== undefined && typeof site_id !== "string") throw new BadRequest("site_id must be a string.");
  if (typeof period !== "string") throw new BadRequest("period must be a string.");
  if (view !== "KAM" && view !== "Customer") throw new BadRequest('view must be "KAM" or "Customer".');
  if (priorities !== undefined && !(Array.isArray(priorities) && priorities.every((p) => typeof p === "string"))) {
    throw new BadRequest("priorities must be a list of strings.");
  }
  const request: PageRequest = { customer_id, period, view };
  if (site_id !== undefined) request.site_id = site_id;
  if (priorities !== undefined) request.priorities = priorities;
  try {
    resolveScope({ customer_id, site_id });
    periodMonths(period);
    resolvePriorities(customer_id, priorities);
  } catch (error) {
    throw new BadRequest(error instanceof Error ? error.message : String(error));
  }
  return request;
}

/**
 * A POST route handler for a page data function. It answers a bad request with 400 and
 * `{ error: { code: "bad_request", message } }`, and anything else with the page data as JSON.
 */
export function pageRoute<T>(page: (request: PageRequest) => T): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const body: unknown = await request.json().catch(() => {
        throw new BadRequest("The body must be JSON.");
      });
      return Response.json(page(parsePageRequest(body)));
    } catch (error) {
      if (!(error instanceof BadRequest)) throw error;
      return Response.json({ error: { code: "bad_request", message: error.message } }, { status: 400 });
    }
  };
}
