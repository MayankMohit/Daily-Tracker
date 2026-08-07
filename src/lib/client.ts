// Tiny client-side fetch wrapper matching the API's { ok, data, error } envelope.
//
// Mutations are offline-aware: when the network is unreachable, a queueable
// request is dropped into the IndexedDB outbox and the caller gets a synthetic
// optimistic result, so the app keeps working and syncs on reconnect (see
// lib/offline/outbox + lib/offline/sync). Reads (GET) and excluded endpoints
// (AI, uploads, PIN, …) always hit the network and fail normally offline.

import { enqueue, isExcluded } from "@/lib/offline/outbox";

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; details?: unknown };

/** Thrown when `fetch` itself rejects (no network) — distinct from an HTTP error
 *  response, which means we reached the server and should behave as before. */
class NetworkError extends Error {}

async function rawRequest<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data;
}

async function request<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  // Reads and non-queueable endpoints go straight to the network.
  if (method === "GET" || isExcluded(url)) return rawRequest<T>(url, method, body);

  // Known-offline: don't wait on a doomed request, queue immediately.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return (await enqueue(url, method, body)) as T;
  }
  try {
    return await rawRequest<T>(url, method, body);
  } catch (err) {
    // Only a genuine network failure falls back to the outbox; HTTP errors
    // (validation, 401, 503…) propagate so callers handle them as before.
    if (err instanceof NetworkError) return (await enqueue(url, method, body)) as T;
    throw err;
  }
}

export const api = {
  get: <T>(url: string) => request<T>(url, "GET"),
  post: <T>(url: string, body?: unknown) => request<T>(url, "POST", body),
  patch: <T>(url: string, body?: unknown) => request<T>(url, "PATCH", body),
  put: <T>(url: string, body?: unknown) => request<T>(url, "PUT", body),
  del: <T>(url: string, body?: unknown) => request<T>(url, "DELETE", body),
};
