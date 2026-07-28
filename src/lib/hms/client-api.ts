/**
 * Browser helpers for HMS admin APIs (session cookies included).
 */

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json;
}

export async function hmsGet<T = unknown>(
  path: string,
  params?: Record<string, string | undefined>
): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, v);
    });
  }
  const q = qs.toString();
  const res = await fetch(`${path}${q ? `?${q}` : ""}`, { cache: "no-store" });
  return parseJson(res);
}

export async function hmsMutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseJson(res);
}
