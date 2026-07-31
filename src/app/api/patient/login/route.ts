import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerAuthClient } from "@/lib/supabase/server";
import { canonicalizeRole, isPatient } from "@/lib/auth/roles";
import { clientIp } from "@/lib/rate-limit";
import { checkAuthRateLimitAsync } from "@/lib/auth/rate-limit";
import { patientLoginRateLimitKey } from "@/lib/auth/security";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and password" },
      { status: 400 }
    );
  }

  const rl = await checkAuthRateLimitAsync(
    patientLoginRateLimitKey(parsed.data.email, clientIp(request))
  );
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many login attempts. Please wait a few minutes and try again.",
      },
      { status: 429 }
    );
  }

  const supabase = createServerAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user || !data.session) {
    // Failed attempts keep accruing against the window.
    return NextResponse.json(
      {
        error:
          error?.message === "Invalid login credentials"
            ? "Invalid email or password"
            : error?.message || "Login failed",
      },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  const role = canonicalizeRole(profile?.role ? String(profile.role) : null);
  if (!role || !isPatient(role)) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          "This account is not a patient portal account. Staff should use the admin login.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}
