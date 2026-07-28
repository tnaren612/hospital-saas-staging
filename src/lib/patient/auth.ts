/**
 * Patient portal auth helpers (server + client-safe session checks).
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";

export function isPatientAuthEnabled(): boolean {
  return isSupabaseBackendEnabled() && hasSupabaseConfig();
}

/** Server: current Supabase user for patient portal (any authenticated role except blocked). */
export async function getPatientAuthUser() {
  if (!isPatientAuthEnabled()) return null;
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
