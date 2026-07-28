"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { adminLoginSchema } from "@/lib/validation";
import { isAdminAuthEnabled } from "@/lib/auth/admin";

export type AuthActionResult = {
  ok: boolean;
  error?: string;
  code?: "INVALID" | "NOT_ADMIN" | "CONFIG" | "UNKNOWN";
};

const DEMO_COOKIE = "ssh_admin_demo";

/**
 * Ensure a profiles row exists after Auth signup/login.
 * Uses service role only on the server after a successful password login.
 * Does NOT grant admin — role stays patient unless already admin.
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
 * Production admin login via Supabase Auth (email + password).
 * Requires profiles.role = 'admin'.
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

  // Local-only fallback when Supabase keys are not configured
  if (!isAdminAuthEnabled()) {
    if (password === "admin123") {
      cookies().set(DEMO_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: raw.remember ? 60 * 60 * 24 * 14 : 60 * 60 * 8,
      });
      return { ok: true };
    }
    return {
      ok: false,
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
      code: "CONFIG",
    };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
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

    if (!role || role.toLowerCase() !== "admin") {
      await supabase.auth.signOut();
      return {
        ok: false,
        error:
          "Access denied. This account is not an administrator. " +
          "In Supabase SQL run: update public.profiles set role = 'admin' where email = '" +
          normalizedEmail +
          "';",
        code: "NOT_ADMIN",
      };
    }

    // Clear any leftover demo cookie
    cookies().delete(DEMO_COOKIE);

    if (raw.remember) {
      cookies().set("ssh_admin_remember", "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    } else {
      cookies().delete("ssh_admin_remember");
    }

    revalidatePath("/admin", "layout");
    return { ok: true };
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

export async function adminLogoutAction(): Promise<void> {
  cookies().delete(DEMO_COOKIE);
  cookies().delete("ssh_admin_remember");

  if (hasSupabaseConfig()) {
    try {
      const supabase = createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }

  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}

export async function hasDemoAdminCookie(): Promise<boolean> {
  return cookies().get(DEMO_COOKIE)?.value === "1";
}
