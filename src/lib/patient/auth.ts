/**
 * Patient portal auth helpers (server-side).
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import {
  canonicalizeRole,
  isAdmin,
  isPatient,
  type AppRole,
} from "@/lib/auth/roles";
import type { User } from "@supabase/supabase-js";

export function isPatientAuthEnabled(): boolean {
  return isSupabaseBackendEnabled() && hasSupabaseConfig();
}

export type PatientAuthSession = {
  user: User;
  role: AppRole;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Server: authenticated patient (or admin acting in portal support).
 * Returns null if not signed in or role is not patient/admin.
 */
export async function getPatientAuthUser(): Promise<User | null> {
  const session = await getPatientSession();
  return session?.user ?? null;
}

/**
 * Full patient session with profile role validation.
 */
export async function getPatientSession(): Promise<PatientAuthSession | null> {
  if (!isPatientAuthEnabled()) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const role = canonicalizeRole(
      profile?.role ? String(profile.role) : null
    );
    if (!role) return null;
    // Patients and admins (support) only
    if (!isPatient(role) && !isAdmin(role)) return null;

    return {
      user,
      role,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? user.email ?? null,
      phone: profile?.phone ?? null,
    };
  } catch {
    return null;
  }
}

/** Throws UNAUTHORIZED if no valid patient session. */
export async function requirePatientSession(): Promise<PatientAuthSession> {
  const session = await getPatientSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
