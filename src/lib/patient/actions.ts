"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { hasSupabaseConfig, isSupabaseBackendEnabled } from "@/lib/supabase/env";

export type PatientAuthResult = {
  ok: boolean;
  error?: string;
};

const registerSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function patientRegisterAction(
  _prev: PatientAuthResult | null,
  formData: FormData
): Promise<PatientAuthResult> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return {
      ok: false,
      error:
        "Patient registration requires Supabase. Use phone OTP demo on login.",
    };
  }

  const parsed = registerSchema.safeParse({
    fullName: String(formData.get("fullName") || "").trim(),
    email: String(formData.get("email") || "")
      .trim()
      .toLowerCase(),
    phone: String(formData.get("phone") || "").trim(),
    password: String(formData.get("password") || ""),
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      error:
        f.fullName?.[0] ||
        f.email?.[0] ||
        f.phone?.[0] ||
        f.password?.[0] ||
        "Invalid form",
    };
  }

  const { fullName, email, phone, password } = parsed.data;
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        role: "patient",
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/patient/login`,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: "Registration failed" };

  // Create portal patient row (service role if needed for RLS timing)
  try {
    const admin = createServiceRoleClient();
    const parts = fullName.split(" ");
    await admin.from("patients").upsert(
      {
        user_id: data.user.id,
        first_name: parts[0] || fullName,
        last_name: parts.slice(1).join(" "),
        email,
        phone,
      },
      { onConflict: "user_id" }
    );
    await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        phone,
        full_name: fullName,
        role: "patient",
      },
      { onConflict: "id" }
    );
  } catch (e) {
    console.warn("[patient-register] profile seed:", e);
  }

  return {
    ok: true,
    error: data.session
      ? undefined
      : "Check your email to verify your account, then sign in.",
  };
}

export async function patientLoginAction(
  _prev: PatientAuthResult | null,
  formData: FormData
): Promise<PatientAuthResult> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return {
      ok: false,
      error: "Use the phone OTP demo when Supabase is not configured.",
    };
  }

  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") || "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") || ""),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password" };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/patient");
  return { ok: true };
}

export async function patientLogoutAction() {
  if (isSupabaseBackendEnabled() && hasSupabaseConfig()) {
    try {
      const supabase = createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  redirect("/patient/login");
}

export async function patientForgotPasswordAction(
  _prev: PatientAuthResult | null,
  formData: FormData
): Promise<PatientAuthResult> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return { ok: false, error: "Password reset requires Supabase Auth." };
  }
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email" };
  }
  const supabase = createServerSupabaseClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/patient/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    error: "If an account exists, a reset link was sent to your email.",
  };
}

export async function patientUpdatePasswordAction(
  _prev: PatientAuthResult | null,
  formData: FormData
): Promise<PatientAuthResult> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return { ok: false, error: "Not available offline." };
  }
  const password = String(formData.get("password") || "");
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters" };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
