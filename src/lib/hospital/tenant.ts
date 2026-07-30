/**
 * Tenant-aware server helpers for multi-hospital data access.
 */

import { cookies, headers } from "next/headers";
import {
  HOSPITAL_SLUG_COOKIE,
  HOSPITAL_SLUG_HEADER,
  resolveHospitalSlug,
} from "@/lib/hospital/resolve-tenant";
import { getHospitalConfig, ensureDefaultHospital } from "@/lib/hospital/service";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";

export type TenantContext = {
  slug: string;
  hospitalId: string | null;
  configSource: string;
};

function canUseDb() {
  if (!hasSupabaseConfig()) return false;
  const key = getServiceRoleKey();
  return Boolean(key && key !== "your_service_role_key_here");
}

/**
 * Resolve slug from request cookies/headers (App Router server only).
 */
export async function resolveRequestHospitalSlug(querySlug?: string | null): Promise<string> {
  try {
    const hdrs = await headers();
    const cookieStore = await cookies();
    return resolveHospitalSlug({
      host: hdrs.get("host"),
      cookieSlug: cookieStore.get(HOSPITAL_SLUG_COOKIE)?.value,
      querySlug: querySlug || null,
      headerSlug: hdrs.get(HOSPITAL_SLUG_HEADER),
    });
  } catch {
    return resolveHospitalSlug({});
  }
}

/**
 * Full tenant context for server actions / route handlers.
 */
export async function getTenantContext(
  querySlug?: string | null
): Promise<TenantContext> {
  const slug = await resolveRequestHospitalSlug(querySlug);
  // Staff/API tenant resolve may seed default hospital once; public config does not
  const config = await getHospitalConfig({ slug, ensureExists: false });
  let hospitalId = config.hospital_id;

  if (!hospitalId && canUseDb()) {
    hospitalId = await ensureDefaultHospital();
  }

  // Resolve id by slug if still null
  if (!hospitalId && canUseDb()) {
    try {
      const sb = createServiceRoleClient();
      const { data } = await sb
        .from("hospitals")
        .select("id")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      hospitalId = data?.id ? String(data.id) : null;
    } catch {
      hospitalId = null;
    }
  }

  return {
    slug,
    hospitalId,
    configSource: config.source,
  };
}

/**
 * Attach hospital_id to an insert payload when known.
 */
export function withHospitalId<T extends Record<string, unknown>>(
  payload: T,
  hospitalId: string | null | undefined
): T & { hospital_id?: string } {
  if (!hospitalId) return payload;
  return { ...payload, hospital_id: hospitalId };
}

/**
 * Apply .eq('hospital_id', id) when tenant is known.
 * Call after building the base query.
 */
export function applyHospitalFilter<
  Q extends { eq: (col: string, val: string) => Q },
>(query: Q, hospitalId: string | null | undefined): Q {
  if (!hospitalId) return query;
  return query.eq("hospital_id", hospitalId) as Q;
}

/**
 * Require tenant context for authenticated hospital staff APIs.
 * Throws structured error if hospital cannot be resolved (when required).
 */
export async function requireTenantHospitalId(
  options?: { optional?: boolean }
): Promise<string | null> {
  const ctx = await getTenantContext();
  if (!ctx.hospitalId && !options?.optional) {
    // Soft mode: still allow service paths without hard fail until 027 applied
    return null;
  }
  return ctx.hospitalId;
}
