/**
 * Auth audit logger (best-effort, never blocks auth flow).
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";

export type AuthEventType =
  | "login_success"
  | "login_failure"
  | "logout"
  | "register"
  | "password_reset_request"
  | "password_update"
  | "role_denied"
  | "email_verification_resend"
  | "admin_action";

export type AuthEventInput = {
  event_type: AuthEventType;
  user_id?: string | null;
  email?: string | null;
  role?: string | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
};

function canWriteAudit(): boolean {
  if (!hasSupabaseConfig()) return false;
  const key = getServiceRoleKey();
  return Boolean(key && key !== "your_service_role_key_here");
}

/**
 * Writes an auth event. Swallows errors so auth never fails on logging.
 */
export async function writeAuthEvent(input: AuthEventInput): Promise<void> {
  if (!canWriteAudit()) return;

  try {
    const sb = createServiceRoleClient();
    const { error } = await sb.from("auth_events").insert({
      event_type: input.event_type,
      user_id: input.user_id || null,
      email: input.email?.toLowerCase() || null,
      role: input.role || null,
      success: input.success !== false,
      metadata: input.metadata || {},
    });
    if (error) {
      console.warn("[auth-audit]", error.message);
    }
  } catch (e) {
    console.warn("[auth-audit] write failed", e);
  }
}
