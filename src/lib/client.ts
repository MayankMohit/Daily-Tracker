// Tiny client-side fetch wrapper matching the API's { ok, data, error } envelope.

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; details?: unknown };

async function request<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data;
}

export const api = {
  get: <T>(url: string) => request<T>(url, "GET"),
  post: <T>(url: string, body?: unknown) => request<T>(url, "POST", body),
  patch: <T>(url: string, body?: unknown) => request<T>(url, "PATCH", body),
  del: <T>(url: string) => request<T>(url, "DELETE"),
};
