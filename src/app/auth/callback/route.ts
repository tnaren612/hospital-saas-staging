/**
 * Supabase Auth PKCE / email-link callback.
 * Exchanges `?code=` for a session, then redirects to a safe in-app path.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/patient/login";
  }
  // Block open redirects and external schemes
  if (raw.includes("://") || raw.includes("\\")) {
    return "/patient/login";
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    const login = new URL("/patient/login", origin);
    login.searchParams.set("error", errorDescription);
    return NextResponse.redirect(login);
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.redirect(new URL(next, origin));
  }

  if (!code) {
    // Some providers land without code (hash-based); send user to next with hint
    const dest = new URL(next, origin);
    dest.searchParams.set("auth", "missing_code");
    return NextResponse.redirect(dest);
  }

  let response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    getSupabaseUrl()!,
    getSupabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.redirect(new URL(next, origin));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback]", error.message);
    const fail = new URL("/patient/login", origin);
    fail.searchParams.set(
      "error",
      "Auth link is invalid or expired. Please request a new one."
    );
    return NextResponse.redirect(fail);
  }

  return response;
}
