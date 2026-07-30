/**
 * Server-side HMS helpers — staff session + Supabase client.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { canonicalizeRole, isAdmin, type AppRole } from "@/lib/auth/roles";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * H-10: block cross-site cookie POSTs to staff APIs.
 * Call on mutating handlers (or via requireHmsAdminMutating).
 */
export function requireSameOriginForMutation(request: Request): NextResponse | null {
  try {
    const check = assertSameOrigin(request, { allowMissing: false });
    if (!check.ok) {
      return NextResponse.json(
        { error: "Forbidden", code: "CSRF_ORIGIN", reason: check.reason },
        { status: 403 }
      );
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Require authenticated hospital staff. Optionally restrict to listed roles
 * (super_admin + admin always allowed).
 */
export async function requireHmsAdmin(allowedRoles?: string[]) {
  if (isAdminAuthEnabled()) {
    const session = await getAdminSession();
    if (!session) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        supabase: null as null,
        mode: "supabase" as const,
        session: null as null,
      };
    }
    if (allowedRoles?.length) {
      const role = canonicalizeRole(session.profile.role);
      const allowed = new Set(
        allowedRoles.map((r) => canonicalizeRole(r) || r.toLowerCase())
      );
      const ok =
        isAdmin(role) || (role !== null && allowed.has(role as AppRole));
      if (!ok) {
        return {
          error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
          supabase: null as null,
          mode: "supabase" as const,
          session: null as null,
        };
      }
    }
    return {
      error: null,
      supabase: await createServerSupabaseClient(),
      mode: "supabase" as const,
      session,
    };
  }

  const demo = (await cookies()).get("ssh_admin_demo")?.value === "1";
  if (!demo) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as null,
      mode: "local" as const,
      session: null as null,
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    return { error: null, supabase, mode: "local" as const, session: null };
  } catch {
    return {
      error: NextResponse.json(
        {
          error:
            "HMS requires Supabase. Configure keys and run migration 004_hospital_management.sql",
        },
        { status: 503 }
      ),
      supabase: null as null,
      mode: "local" as const,
      session: null as null,
    };
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function createNotification(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  payload: {
    type: string;
    title: string;
    message: string;
    meta?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from("admin_notifications").insert({
      type: payload.type,
      title: payload.title,
      message: payload.message,
      meta: payload.meta || {},
    });
  } catch {
    // non-fatal
  }
}
