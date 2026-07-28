/**
 * Server-side admin auth helpers (Step 4 — production).
 * Never import service role into client components.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import type { User } from "@supabase/supabase-js";

export type AdminProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
};

export type AdminSession = {
  user: User;
  profile: AdminProfile;
};

/**
 * Admin auth uses Supabase whenever public keys are configured.
 * Independent of appointment demo/localStorage mode.
 */
export function isAdminAuthEnabled(): boolean {
  return hasSupabaseConfig();
}

/**
 * Returns the current admin session or null.
 * Validates JWT via getUser() and profiles.role === 'admin'.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  if (!isAdminAuthEnabled()) return null;

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) return null;
    if (String(profile.role).toLowerCase() !== "admin") return null;

    return {
      user,
      profile: profile as AdminProfile,
    };
  } catch {
    return null;
  }
}

/**
 * Returns session for any authenticated user (not necessarily admin).
 */
export async function getAuthUser(): Promise<{
  user: User;
  role: string | null;
} | null> {
  if (!isAdminAuthEnabled()) return null;

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return { user, role: (profile?.role as string) || null };
  } catch {
    return null;
  }
}

/** Throws if the current request is not an authenticated admin. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
