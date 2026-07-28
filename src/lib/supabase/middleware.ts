/**
 * Supabase session refresh + production admin route protection (Step 4).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

const ADMIN_PUBLIC = ["/admin/login", "/admin/forbidden"];

function isAdminPublicPath(pathname: string): boolean {
  return ADMIN_PUBLIC.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAdminProtectedPath(pathname: string): boolean {
  if (!pathname.startsWith("/admin")) return false;
  if (isAdminPublicPath(pathname)) return false;
  return true;
}

function isAdminApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin");
}

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  if (next) url.searchParams.set("next", next);
  else url.searchParams.delete("next");
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabaseEnabled = hasSupabaseConfig();

  // --- Local demo mode only when Supabase keys are missing ---
  if (!supabaseEnabled) {
    if (isAdminProtectedPath(pathname) || isAdminApiPath(pathname)) {
      const demo = request.cookies.get("ssh_admin_demo")?.value === "1";
      if (!demo) {
        if (isAdminApiPath(pathname)) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return redirectTo(request, "/admin/login", pathname);
      }
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      const demo = request.cookies.get("ssh_admin_demo")?.value === "1";
      return redirectTo(
        request,
        demo ? "/admin/dashboard" : "/admin/login"
      );
    }
    return supabaseResponse;
  }

  // --- Production: Supabase session cookies ---
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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function getRole(): Promise<string | null> {
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return profile?.role ? String(profile.role).toLowerCase() : null;
  }

  // /admin root hub
  if (pathname === "/admin" || pathname === "/admin/") {
    if (!user) return redirectTo(request, "/admin/login");
    const role = await getRole();
    if (role === "admin") return redirectTo(request, "/admin/dashboard");
    return redirectTo(request, "/admin/forbidden");
  }

  // Logged-in admin visiting login → dashboard
  if (pathname === "/admin/login" && user) {
    const role = await getRole();
    if (role === "admin") {
      return redirectTo(request, "/admin/dashboard");
    }
    // Logged in but not admin — show 403 rather than login loop
    if (role && role !== "admin") {
      return redirectTo(request, "/admin/forbidden");
    }
  }

  const needsAuth = isAdminProtectedPath(pathname) || isAdminApiPath(pathname);
  if (!needsAuth) {
    return supabaseResponse;
  }

  if (!user) {
    if (isAdminApiPath(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return redirectTo(request, "/admin/login", pathname);
  }

  const role = await getRole();

  if (role !== "admin") {
    if (isAdminApiPath(pathname)) {
      return NextResponse.json(
        { error: "Forbidden: admin role required" },
        { status: 403 }
      );
    }
    return redirectTo(request, "/admin/forbidden");
  }

  return supabaseResponse;
}
