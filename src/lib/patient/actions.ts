"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { hasSupabaseConfig, isSupabaseBackendEnabled } from "@/lib/supabase/env";
import {
  passwordSchema,
  passwordsMatch,
  validatePassword,
} from "@/lib/auth/password-policy";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { writeAuthEvent } from "@/lib/auth/audit";
import { canonicalizeRole, isPatient, ROLES } from "@/lib/auth/roles";

export type PatientAuthResult = {
  ok: boolean;
  error?: string;
  /** Soft success message (e.g. verify email) without treating as failure */
  info?: string;
  /** Authorized session handoff for the browser Supabase client. */
  session?: {
    access_token: string;
    refresh_token: string;
  };
  code?: "RATE_LIMIT" | "ROLE" | "VERIFY" | "INVALID" | "CONFIG" | "UNKNOWN";
};

function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    "";
  if (!raw) return "";
  if (raw.startsWith("http")) return raw.replace(/\/$/, "");
  return `https://${raw.replace(/\/$/, "")}`;
}

const registerSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required"),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
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
        "Patient registration requires Supabase. Use phone OTP demo on login when offline.",
      code: "CONFIG",
    };
  }

  const parsed = registerSchema.safeParse({
    fullName: String(formData.get("fullName") || "").trim(),
    email: String(formData.get("email") || "")
      .trim()
      .toLowerCase(),
    phone: String(formData.get("phone") || "").trim(),
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || ""),
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
        f.confirmPassword?.[0] ||
        "Invalid form",
      code: "INVALID",
    };
  }

  const matchErr = passwordsMatch(
    parsed.data.password,
    parsed.data.confirmPassword
  );
  if (matchErr) {
    return { ok: false, error: matchErr, code: "INVALID" };
  }

  const { fullName, email, phone, password } = parsed.data;

  const limit = checkAuthRateLimit(`register:${email}`);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many registration attempts. Try again in ${limit.retryAfterSeconds}s.`,
      code: "RATE_LIMIT",
    };
  }

  const supabase = await createServerSupabaseClient();
  const base = siteUrl();
  const emailRedirectTo = base
    ? `${base}/auth/callback?next=${encodeURIComponent("/patient/login")}`
    : undefined;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Never trust client role; DB trigger forces patient
      data: {
        full_name: fullName,
        phone,
      },
      emailRedirectTo,
    },
  });

  if (error) {
    await writeAuthEvent({
      event_type: "register",
      email,
      success: false,
      metadata: { message: error.message },
    });
    return { ok: false, error: error.message, code: "UNKNOWN" };
  }
  if (!data.user) {
    return { ok: false, error: "Registration failed", code: "UNKNOWN" };
  }

  // Seed portal rows (service role if available)
  try {
    const admin = createServiceRoleClient();
    const parts = fullName.split(/\s+/);
    await admin.from("patients").upsert(
      {
        user_id: data.user.id,
        first_name: parts[0] || fullName,
        last_name: parts.slice(1).join(" ") || "",
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
        role: ROLES.PATIENT,
      },
      { onConflict: "id" }
    );
  } catch (e) {
    console.warn("[patient-register] profile seed:", e);
  }

  await writeAuthEvent({
    event_type: "register",
    user_id: data.user.id,
    email,
    role: ROLES.PATIENT,
    success: true,
    metadata: { emailConfirmed: Boolean(data.session) },
  });

  if (!data.session) {
    return {
      ok: true,
      info: "Check your email to verify your account, then sign in.",
    };
  }

  return {
    ok: true,
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }
      : undefined,
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
      code: "CONFIG",
    };
  }

  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") || "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") || ""),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter a valid email and password",
      code: "INVALID",
    };
  }

  const { email, password } = parsed.data;
  const limit = checkAuthRateLimit(`patient-login:${email}`);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`,
      code: "RATE_LIMIT",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await writeAuthEvent({
      event_type: "login_failure",
      email,
      success: false,
      metadata: { portal: "patient", message: error?.message },
    });
    const msg = error?.message || "Invalid email or password";
    // Friendlier copy for unconfirmed email
    if (/confirm|verified|verification/i.test(msg)) {
      return {
        ok: false,
        error: "Please verify your email before signing in. Check your inbox.",
        code: "VERIFY",
      };
    }
    return {
      ok: false,
      error:
        msg === "Invalid login credentials"
          ? "Invalid email or password"
          : msg,
      code: "INVALID",
    };
  }

  // Role gate: patient portal is for patients only (admins may use staff login)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = canonicalizeRole(profile?.role ? String(profile.role) : null);

  if (!role || !isPatient(role)) {
    await supabase.auth.signOut();
    await writeAuthEvent({
      event_type: "role_denied",
      user_id: data.user.id,
      email,
      role: role || undefined,
      success: false,
      metadata: { portal: "patient" },
    });
    return {
      ok: false,
      error:
        "This account is not a patient portal account. Staff should use the admin login.",
      code: "ROLE",
    };
  }

  await writeAuthEvent({
    event_type: "login_success",
    user_id: data.user.id,
    email,
    role: ROLES.PATIENT,
    success: true,
    metadata: { portal: "patient" },
  });

  revalidatePath("/patient");
  return {
    ok: true,
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }
      : undefined,
  };
}

export async function patientLogoutAction() {
  if (isSupabaseBackendEnabled() && hasSupabaseConfig()) {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await writeAuthEvent({
        event_type: "logout",
        user_id: user?.id,
        email: user?.email,
        role: ROLES.PATIENT,
        success: true,
      });
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

  const limit = checkAuthRateLimit(`forgot:${email}`);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many reset requests. Try again in ${limit.retryAfterSeconds}s.`,
      code: "RATE_LIMIT",
    };
  }

  const supabase = await createServerSupabaseClient();
  const base = siteUrl();
  const redirectTo = base
    ? `${base}/auth/callback?next=${encodeURIComponent("/patient/reset-password")}`
    : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  // Always return generic success to avoid email enumeration
  await writeAuthEvent({
    event_type: "password_reset_request",
    email,
    success: !error,
    metadata: { message: error?.message },
  });

  if (error) {
    // Still show generic message in production UX
    console.warn("[patient-forgot]", error.message);
  }

  return {
    ok: true,
    info: "If an account exists for that email, a reset link has been sent.",
  };
}

export async function patientUpdatePasswordAction(
  _prev: PatientAuthResult | null,
  formData: FormData
): Promise<PatientAuthResult> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return { ok: false, error: "Not available offline.", code: "CONFIG" };
  }

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const policyErr = validatePassword(password);
  if (policyErr) {
    return { ok: false, error: policyErr, code: "INVALID" };
  }
  const matchErr = passwordsMatch(password, confirmPassword);
  if (matchErr) {
    return { ok: false, error: matchErr, code: "INVALID" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error:
        "Your reset session expired. Request a new password reset link and open it again.",
      code: "INVALID",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: error.message, code: "UNKNOWN" };
  }

  await writeAuthEvent({
    event_type: "password_update",
    user_id: user.id,
    email: user.email,
    success: true,
  });

  return { ok: true, info: "Password updated. You can sign in now." };
}

export async function patientResendVerificationAction(
  _prev: PatientAuthResult | null,
  formData: FormData
): Promise<PatientAuthResult> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return {
      ok: false,
      error: "Email verification requires Supabase.",
      code: "CONFIG",
    };
  }

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email", code: "INVALID" };
  }

  const limit = checkAuthRateLimit(`resend-verify:${email}`);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.`,
      code: "RATE_LIMIT",
    };
  }

  const supabase = await createServerSupabaseClient();
  const base = siteUrl();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: base
        ? `${base}/auth/callback?next=${encodeURIComponent("/patient/login")}`
        : undefined,
    },
  });

  await writeAuthEvent({
    event_type: "email_verification_resend",
    email,
    success: !error,
    metadata: { message: error?.message },
  });

  // Generic message
  return {
    ok: true,
    info: "If that email needs verification, a new link has been sent.",
  };
}
