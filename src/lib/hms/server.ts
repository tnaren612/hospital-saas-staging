/**
 * Server-side HMS helpers — admin session + Supabase client.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function requireHmsAdmin() {
  if (isAdminAuthEnabled()) {
    const session = await getAdminSession();
    if (!session) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        supabase: null as null,
        mode: "supabase" as const,
      };
    }
    return {
      error: null,
      supabase: createServerSupabaseClient(),
      mode: "supabase" as const,
      session,
    };
  }

  const demo = cookies().get("ssh_admin_demo")?.value === "1";
  if (!demo) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as null,
      mode: "local" as const,
    };
  }

  // Local demo: still try Supabase if keys exist for HMS tables
  try {
    const supabase = createServerSupabaseClient();
    return { error: null, supabase, mode: "local" as const };
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
  supabase: ReturnType<typeof createServerSupabaseClient>,
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
