/**
 * Server-side auth session helpers.
 * Never import service role into client components.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import type { User } from "@supabase/supabase-js";
import {
  canonicalizeRole,
  isAdmin as roleIsAdmin,
  isHospitalStaff,
  type AppRole,
} from "@/lib/auth/roles";

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
 * Auth enabled whenever public Supabase keys exist.
 */
export function isAdminAuthEnabled(): boolean {
  return hasSupabaseConfig();
}

/**
 * Session for hospital staff (any non-patient operational role).
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  if (!isAdminAuthEnabled()) return null;

  try {
    const supabase = await createServerSupabaseClient();
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
    const role = canonicalizeRole(String(profile.role || ""));
    if (!role || !isHospitalStaff(role)) return null;

    return {
      user,
      profile: { ...profile, role } as AdminProfile,
    };
  } catch {
    return null;
  }
}

/** super_admin or admin only */
export async function getStrictAdminSession(): Promise<AdminSession | null> {
  const session = await getAdminSession();
  if (!session) return null;
  if (!roleIsAdmin(session.profile.role)) return null;
  return session;
}

/**
 * Returns session for any authenticated user (including patient).
 */
export async function getAuthUser(): Promise<{
  user: User;
  role: AppRole | null;
} | null> {
  if (!isAdminAuthEnabled()) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return {
      user,
      role: canonicalizeRole(profile?.role ? String(profile.role) : null),
    };
  } catch {
    return null;
  }
}

/** Throws if not hospital staff */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/** Throws if not super_admin/admin */
export async function requireStrictAdminSession(): Promise<AdminSession> {
  const session = await getStrictAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
