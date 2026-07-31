/**
 * Shared helpers for the Data Management admin API (`/api/admin/datahub/*`).
 * All routes are admin-only (super_admin / admin) and tenant-scoped.
 */

import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getTenantContext } from "@/lib/hospital/tenant";
import { supabaseProvider } from "@/lib/datahub/provider";
import { getModule } from "@/lib/datahub/registry";
import { resolveDataManagementConfig } from "@/lib/datahub/settings";
import { getHospitalConfig } from "@/lib/hospital/service";
import type { DataModule } from "@/lib/datahub/types";
import type { DataProvider } from "@/lib/datahub/provider";

export const ADMIN_ROLES = ["super_admin", "admin"];

export type AuthCtx = {
  hospitalId: string | null;
  session: Awaited<ReturnType<typeof requireHmsAdmin>>["session"];
  actor: { email: string | null; id: string | null };
};

export async function authorize(): Promise<{
  ctx?: AuthCtx;
  error?: NextResponse;
}> {
  const gate = await requireHmsAdmin(ADMIN_ROLES);
  if (gate.error || !gate.supabase) {
    return { error: gate.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const tenant = await getTenantContext();
  return {
    ctx: {
      hospitalId: tenant.hospitalId,
      session: gate.session,
      actor: {
        email: gate.session?.profile.email || gate.session?.user.email || null,
        id: gate.session?.user.id || null,
      },
    },
  };
}

/** Resolve the canonical data-management config for the tenant. */
export async function getDataConfig() {
  const config = await getHospitalConfig({ bypassCache: true });
  return resolveDataManagementConfig(config.data_management);
}

export function makeProvider(): Promise<DataProvider> {
  return supabaseProvider();
}

export function resolveModule(
  key: string
): { module?: DataModule; error?: NextResponse } {
  const mod = getModule(key);
  if (!mod) {
    return {
      error: NextResponse.json({ error: "Unknown module" }, { status: 404 }),
    };
  }
  return { module: mod };
}

/** Best-effort client IP for audit logging. */
export function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

/** Read a JSON body safely. */
export async function readJson<T = Record<string, unknown>>(
  request: Request
): Promise<{ body?: T; error?: NextResponse }> {
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return {
      error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
  return { body: raw as T };
}
