"use client";

// Page data from a POST route for the current page state (#26). A reply to an older state is dropped.

import { useEffect, useState } from "react";

import type { PageRequest } from "../lib/pages/request.ts";
import { pageRequest } from "./page-state.ts";
import { errorMessage, postPage, useDashboard } from "./shell.tsx";

interface Reply<T> {
  request: PageRequest;
  data: T | null;
  error: string | null;
}

/**
 * The route's reply for the current page state. While a new reply loads, the last data stays on screen if it is
 * for the same Customer and view, so a period change does not blank the page. Data for another Customer or view
 * never shows, so a KAM-only result never shows in the Customer view.
 */
export function usePageData<T>(route: string): { data: T | null; error: string | null } {
  const { state } = useDashboard();
  const request = pageRequest(state);
  const key = JSON.stringify(request);
  const [reply, setReply] = useState<Reply<T> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    postPage<T>(route, request, controller.signal)
      .then((data) => setReply({ request, data, error: null }))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setReply({ request, data: null, error: errorMessage(e) });
      });
    return () => controller.abort();
    // request is rebuilt on every render. key holds the same values.
  }, [route, key]);
  if (reply === null) return { data: null, error: null };
  if (JSON.stringify(reply.request) === key) return { data: reply.data, error: reply.error };
  const sameScreen = reply.request.customer_id === state.customer_id && reply.request.view === state.view;
  return { data: sameScreen ? reply.data : null, error: null };
}
