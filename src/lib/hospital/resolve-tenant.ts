/**
 * Resolve active hospital slug for multi-tenant SaaS.
 *
 * H-03 production priority (trust host first):
 * 1. Host map / subdomain (cannot be spoofed by cookie alone)
 * 2. Cookie (same-site branding continuity)
 * 3. Query/header ONLY when allowClientOverride=true (admin preview)
 * 4. Default slug
 *
 * Legacy resolveHospitalSlug still accepts overrides for admin tooling
 * when allowClientOverride is true.
 */

import { getDefaultHospitalSlug } from "@/lib/hospital/defaults";

export const HOSPITAL_SLUG_COOKIE = "ssh_hospital_slug";
export const HOSPITAL_SLUG_HEADER = "x-hospital-slug";

/** Parse "host1:slug1,host2:slug2" */
export function parseHostMap(raw?: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const [host, slug] = part.split(":").map((s) => s.trim().toLowerCase());
    if (host && slug) map[host] = slug;
  }
  return map;
}

/**
 * Extract tenant slug from hostname.
 * - Exact match in host map
 * - Optional first subdomain (excluding www)
 */
export function slugFromHost(
  hostHeader: string | null | undefined,
  options?: {
    hostMap?: string | null;
    subdomainTenant?: boolean;
  }
): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0].toLowerCase();
  const map = parseHostMap(
    options?.hostMap ?? process.env.HOSPITAL_HOST_MAP
  );
  if (map[host]) return map[host];

  const useSub =
    options?.subdomainTenant ??
    (process.env.HOSPITAL_SUBDOMAIN_TENANT === "true" ||
      process.env.HOSPITAL_SUBDOMAIN_TENANT === "1");

  if (useSub) {
    const parts = host.split(".");
    if (parts.length >= 3) {
      const sub = parts[0];
      if (sub && sub !== "www" && sub !== "app" && sub !== "api") {
        return sub.replace(/[^a-z0-9-]/g, "");
      }
    }
  }
  return null;
}

function validSlug(raw: string | null | undefined): string | null {
  const s = (raw || "").toLowerCase().trim();
  if (s && /^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) return s;
  return null;
}

/**
 * Production-safe tenant resolution (H-03).
 * Host wins when mapped; client query/header ignored unless allowClientOverride.
 */
export function resolveHospitalSlug(input: {
  host?: string | null;
  cookieSlug?: string | null;
  querySlug?: string | null;
  headerSlug?: string | null;
  /**
   * When true, query/header can override (admin preview / super_admin tools).
   * Middleware sets this only when TENANT_ALLOW_QUERY_OVERRIDE=true or non-production.
   */
  allowClientOverride?: boolean;
}): string {
  const allowOverride =
    input.allowClientOverride === true ||
    process.env.TENANT_ALLOW_QUERY_OVERRIDE === "true" ||
    process.env.TENANT_ALLOW_QUERY_OVERRIDE === "1";

  // 1) Host map / subdomain — authoritative for multi-hospital SaaS
  const fromHost = slugFromHost(input.host);
  if (fromHost) {
    // Optional admin preview override only when explicitly allowed AND query present
    if (allowOverride) {
      const q = validSlug(input.querySlug);
      if (q) return q;
    }
    return fromHost;
  }

  // 2) Client overrides only when allowed (dev / explicit preview)
  if (allowOverride) {
    const q = validSlug(input.querySlug);
    if (q) return q;
    const header = validSlug(input.headerSlug);
    if (header) return header;
  }

  // 3) Cookie (set by middleware from host previously)
  const cookie = validSlug(input.cookieSlug);
  if (cookie) return cookie;

  // 4) Header without override flag still ignored for security
  // 5) Default
  return getDefaultHospitalSlug();
}
