"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { adminLoginSchema } from "@/lib/validation";
import { isAdminAuthEnabled } from "@/lib/auth/admin";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { writeAuthEvent } from "@/lib/auth/audit";

export type AuthActionResult = {
  ok: boolean;
  error?: string;
  code?: "INVALID" | "NOT_ADMIN" | "CONFIG" | "UNKNOWN" | "RATE_LIMIT";
  /** Role-based post-login path */
  redirectTo?: string;
  info?: string;
};

const DEMO_COOKIE = "ssh_admin_demo";

function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    "";
  if (!raw) return "";
  if (raw.startsWith("http")) return raw.replace(/\/$/, "");
  return `https://${raw.replace(/\/$/, "")}`;
}

/**
 * Ensure a profiles row exists after Auth signup/login.
 * Uses service role only on the server after a successful password login.
 * Does NOT grant admin — role stays patient unless already staff.
 */
async function ensureProfileRow(userId: string, email: string | undefined) {
  try {
    const admin = createServiceRoleClient();
    const { data: existing } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (existing) return existing;

    const { data: created, error } = await admin
      .from("profiles")
      .insert({
        id: userId,
        email: email?.toLowerCase() ?? null,
        role: "patient",
      })
      .select("id, role")
      .single();

    if (error) {
      console.error("[admin-auth] ensureProfileRow:", error.message);
      return null;
    }
    return created;
  } catch (e) {
    console.error("[admin-auth] ensureProfileRow failed", e);
    return null;
  }
}

/**
 * Production staff login via Supabase Auth (email + password).
 * Requires profiles.role ∈ hospital staff roles.
 */
export async function adminLoginAction(
  _prev: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const raw = {
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
    remember:
      formData.get("remember") === "on" ||
      formData.get("remember") === "true",
  };

  const parsed = adminLoginSchema.safeParse(raw);
  if (!parsed.success) {
    const msg =
      parsed.error.flatten().fieldErrors.email?.[0] ||
      parsed.error.flatten().fieldErrors.password?.[0] ||
      "Invalid credentials";
    return { ok: false, error: msg, code: "INVALID" };
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const limit = checkAuthRateLimit(`admin-login:${normalizedEmail}`);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`,
      code: "RATE_LIMIT",
    };
  }

  // Local-only fallback requires an explicit non-production secret.
  if (!isAdminAuthEnabled() && (process.env.NODE_ENV as string) !== "production") {
    const demoPassword = process.env.LOCAL_DEMO_PASSWORD;
    if (demoPassword && password === demoPassword) {
      (await cookies()).set(DEMO_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: raw.remember ? 60 * 60 * 24 * 14 : 60 * 60 * 8,
      });
      return { ok: true, redirectTo: "/admin/dashboard" };
    }
    return {
      ok: false,
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
      code: "CONFIG",
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      await writeAuthEvent({
        event_type: "login_failure",
        email: normalizedEmail,
        success: false,
        metadata: { portal: "admin", message: error?.message },
      });
      return {
        ok: false,
        error:
          error?.message === "Invalid login credentials"
            ? "Invalid email or password"
            : error?.message || "Invalid email or password",
        code: "INVALID",
      };
    }

    // Load role; create profile row if Auth user has no profile yet
    let role: string | null = null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[admin-auth] profile read:", profileError.message);
    }

    if (profile?.role) {
      role = String(profile.role);
    } else {
      const ensured = await ensureProfileRow(
        data.user.id,
        data.user.email ?? normalizedEmail
      );
      role = ensured?.role ? String(ensured.role) : null;
    }

    const { canonicalizeRole, isHospitalStaff, homePathForRole } =
      await import("@/lib/auth/roles");
    const appRole = canonicalizeRole(role);
    if (!appRole || !isHospitalStaff(appRole)) {
      await supabase.auth.signOut();
      await writeAuthEvent({
        event_type: "role_denied",
        user_id: data.user.id,
        email: normalizedEmail,
        role: role || undefined,
        success: false,
        metadata: { portal: "admin" },
      });
      return {
        ok: false,
        error:
          "Access denied. This account is not hospital staff. " +
          "Set profiles.role to one of: super_admin, admin, doctor, receptionist, " +
          "lab_technician, pharmacist, billing, finance, hr, manager.",
        code: "NOT_ADMIN",
      };
    }

    // Clear any leftover demo cookie
    (await cookies()).delete(DEMO_COOKIE);

    if (raw.remember) {
      (await cookies()).set("ssh_admin_remember", "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    } else {
      (await cookies()).delete("ssh_admin_remember");
    }

    await writeAuthEvent({
      event_type: "login_success",
      user_id: data.user.id,
      email: normalizedEmail,
      role: appRole,
      success: true,
      metadata: { portal: "admin" },
    });

    revalidatePath("/admin", "layout");
    return { ok: true, redirectTo: homePathForRole(appRole) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    // Common misconfig: service role missing when ensuring profile
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return {
        ok: false,
        error:
          "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required for admin login profile checks.",
        code: "CONFIG",
      };
    }
    return { ok: false, error: message, code: "UNKNOWN" };
  }
}

/**
 * Staff password reset email (same Supabase flow as patient; lands on patient reset UI
 * or can be extended to /admin/reset-password later).
 */
export async function adminForgotPasswordAction(
  _prev: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  if (!isAdminAuthEnabled()) {
    return {
      ok: false,
      error: "Password reset requires Supabase Auth.",
      code: "CONFIG",
    };
  }

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email", code: "INVALID" };
  }

  const limit = checkAuthRateLimit(`admin-forgot:${email}`);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many reset requests. Try again in ${limit.retryAfterSeconds}s.`,
      code: "RATE_LIMIT",
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const base = siteUrl();
    const redirectTo = base
      ? `${base}/auth/callback?next=${encodeURIComponent("/patient/reset-password")}`
      : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    await writeAuthEvent({
      event_type: "password_reset_request",
      email,
      success: !error,
      metadata: { portal: "admin", message: error?.message },
    });

    if (error) {
      console.warn("[admin-forgot]", error.message);
    }

    return {
      ok: true,
      info: "If an account exists for that email, a reset link has been sent.",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return { ok: false, error: message, code: "UNKNOWN" };
  }
}

export async function adminLogoutAction(): Promise<void> {
  (await cookies()).delete(DEMO_COOKIE);
  (await cookies()).delete("ssh_admin_remember");

  if (hasSupabaseConfig()) {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await writeAuthEvent({
        event_type: "logout",
        user_id: user?.id,
        email: user?.email,
        success: true,
        metadata: { portal: "admin" },
      });
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }

  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}

export async function hasDemoAdminCookie(): Promise<boolean> {
  return (await cookies()).get(DEMO_COOKIE)?.value === "1";
}
