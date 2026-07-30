/**
 * H-10: Origin / Referer checks for cookie-authenticated mutating requests.
 * SameSite=Lax covers many cases; this blocks cross-site POSTs with forged Origin.
 */

export type OriginCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Allow request if Origin (or Referer) matches Host / configured site URL.
 * GET/HEAD/OPTIONS always pass.
 * Server-to-server (no Origin and no Referer) allowed for webhooks etc. when skipIfMissing.
 */
export function assertSameOrigin(request: Request, options?: {
  /** Allow missing Origin+Referer (webhooks, curl). Default false for browser cookie APIs. */
  allowMissing?: boolean;
}): OriginCheckResult {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";

  const allowedHosts = new Set<string>();
  if (host) allowedHosts.add(host.split(",")[0].trim().toLowerCase());

  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (site) {
    try {
      allowedHosts.add(new URL(site).host.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  // Local dev
  allowedHosts.add("localhost:3000");
  allowedHosts.add("127.0.0.1:3000");

  if (!origin && !referer) {
    if (options?.allowMissing) return { ok: true };
    return { ok: false, reason: "missing_origin" };
  }

  const candidates = [origin, referer].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (allowedHosts.has(u.host.toLowerCase())) {
        return { ok: true };
      }
    } catch {
      /* continue */
    }
  }

  return { ok: false, reason: "origin_mismatch" };
}

export function forbiddenOriginResponse(reason: string) {
  return Response.json(
    { error: "Forbidden", code: "CSRF_ORIGIN", reason },
    { status: 403 }
  );
}
