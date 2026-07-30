/**
 * Supabase session refresh + RBAC route protection.
 * Performance: public pages skip getUser() when no session cookie is present.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import {
  canonicalizeRole,
  homePathForRole,
  isHospitalStaff,
  isPublicUnderGuard,
  matchRouteGuard,
  roleAllowedOnPath,
  ROLES,
} from "@/lib/auth/roles";
import {
  HOSPITAL_SLUG_COOKIE,
  HOSPITAL_SLUG_HEADER,
  resolveHospitalSlug,
} from "@/lib/hospital/resolve-tenant";
import { assertSameOrigin } from "@/lib/auth/csrf";

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  if (process.env.NODE_ENV !== "production") {
    url.protocol = "http:";
    url.host = request.headers.get("host") || url.host;
  }
  url.pathname = pathname;
  if (next) url.searchParams.set("next", next);
  else url.searchParams.delete("next");
  return NextResponse.redirect(url);
}

/** Attach hospital slug cookie/header for multi-tenant config resolution (H-03 host-first) */
function withHospitalTenant(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const allowClientOverride =
    process.env.TENANT_ALLOW_QUERY_OVERRIDE === "true" ||
    process.env.TENANT_ALLOW_QUERY_OVERRIDE === "1" ||
    process.env.NODE_ENV !== "production";

  const slug = resolveHospitalSlug({
    host: request.headers.get("host"),
    cookieSlug: request.cookies.get(HOSPITAL_SLUG_COOKIE)?.value,
    querySlug:
      request.nextUrl.searchParams.get("hospital") ||
      request.nextUrl.searchParams.get("slug"),
    headerSlug: request.headers.get(HOSPITAL_SLUG_HEADER),
    allowClientOverride,
  });

  response.cookies.set(HOSPITAL_SLUG_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
  });
  response.headers.set(HOSPITAL_SLUG_HEADER, slug);
  return response;
}

function forbidden(request: NextRequest, isApi: boolean) {
  if (isApi) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return redirectTo(request, "/admin/forbidden");
}

function unauthorized(request: NextRequest, isApi: boolean, nextPath: string) {
  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (nextPath.startsWith("/patient") || nextPath.startsWith("/api/patient")) {
    return redirectTo(request, "/patient/login", nextPath);
  }
  return redirectTo(request, "/admin/login", nextPath);
}

/** True if any Supabase auth cookie is present (sb-*-auth-token). */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (c) =>
        c.name.includes("auth-token") ||
        c.name.startsWith("sb-") ||
        c.name === "ssh_admin_demo"
    );
}

// Local helper to avoid circular import issues in edge
function isAdmin(role: string | null): boolean {
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = withHospitalTenant(
    request,
    NextResponse.next({ request })
  );
  const { pathname } = request.nextUrl;
  const supabaseEnabled = hasSupabaseConfig();
  const guard = matchRouteGuard(pathname);
  const isApi =
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/phase2") ||
    pathname.startsWith("/api/patient") ||
    pathname.startsWith("/api/payments") ||
    pathname.startsWith("/api/invoices");

  // Cookie-authenticated mutations must originate from this application.
  // Non-cookie integrations (for example signed webhooks) retain their own
  // authentication and are not blocked by this browser-focused CSRF guard.
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) &&
    hasAuthCookie(request)
  ) {
    const originCheck = assertSameOrigin(request, { allowMissing: false });
    if (!originCheck.ok) {
      return NextResponse.json(
        {
          error: "Forbidden",
          code: "CSRF_ORIGIN",
          reason: originCheck.reason,
        },
        { status: 403 }
      );
    }
  }

  // --- Local demo: only /admin/* gated by demo cookie ---
  if (!supabaseEnabled) {
    if (guard && !isPublicUnderGuard(pathname, guard)) {
      if (
        pathname.startsWith("/admin") ||
        pathname.startsWith("/api/admin") ||
        pathname.startsWith("/api/phase2")
      ) {
        const demo = request.cookies.get("ssh_admin_demo")?.value === "1";
        if (!demo) {
          return withHospitalTenant(
            request,
            unauthorized(request, isApi, pathname)
          );
        }
      } else if (
        pathname.startsWith("/patient") &&
        !pathname.startsWith("/patient/login") &&
        !pathname.startsWith("/patient/reset-password")
      ) {
        return supabaseResponse;
      } else if (
        [
          "/laboratory",
          "/pharmacy",
          "/billing",
          "/reception",
          "/finance",
          "/hr",
          "/manager",
        ].some((p) => pathname === p || pathname.startsWith(`${p}/`))
      ) {
        const demo = request.cookies.get("ssh_admin_demo")?.value === "1";
        if (!demo) {
          return withHospitalTenant(
            request,
            unauthorized(request, false, pathname)
          );
        }
      }
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      const demo = request.cookies.get("ssh_admin_demo")?.value === "1";
      return withHospitalTenant(
        request,
        redirectTo(request, demo ? "/admin/dashboard" : "/admin/login")
      );
    }
    return supabaseResponse;
  }

  // Credential exchange must remain public; the route validates credentials
  // and the account role before returning a session.
  if (pathname === "/api/patient/login") {
    return supabaseResponse;
  }

  /**
   * FAST PATH (public + no session cookie):
   * Skip Supabase getUser() network round-trip entirely.
   * Covers /appointment, home, doctors, public APIs, etc.
   */
  const isPublicPath =
    !guard || isPublicUnderGuard(pathname, guard);
  const needsLoginRedirect =
    pathname === "/admin/login" || pathname === "/patient/login";

  if (isPublicPath && !needsLoginRedirect && !hasAuthCookie(request)) {
    // Still set tenant cookie; no auth call
    return supabaseResponse;
  }

  // --- Production: Supabase session (only when cookie present or protected) ---
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
          supabaseResponse = withHospitalTenant(
            request,
            NextResponse.next({ request })
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // If public path and we only need redirect-if-logged-in for login pages,
  // or protected routes — always getUser when we got here.
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
    return canonicalizeRole(profile?.role ? String(profile.role) : null);
  }

  // /admin hub
  if (pathname === "/admin" || pathname === "/admin/") {
    if (!user) {
      return withHospitalTenant(request, redirectTo(request, "/admin/login"));
    }
    const role = await getRole();
    if (role && isHospitalStaff(role)) {
      return withHospitalTenant(
        request,
        redirectTo(request, homePathForRole(role))
      );
    }
    return withHospitalTenant(
      request,
      redirectTo(request, "/admin/forbidden")
    );
  }

  // Already logged-in users on admin login → role home
  if (pathname === "/admin/login" && user) {
    const role = await getRole();
    if (role && isHospitalStaff(role)) {
      return withHospitalTenant(
        request,
        redirectTo(request, homePathForRole(role))
      );
    }
    if (role === ROLES.PATIENT) {
      return withHospitalTenant(
        request,
        redirectTo(request, "/patient/dashboard")
      );
    }
  }

  // Patient login → patient home if already patient
  if (pathname === "/patient/login" && user) {
    const role = await getRole();
    if (role === ROLES.PATIENT || isAdmin(role)) {
      return withHospitalTenant(
        request,
        redirectTo(request, "/patient/dashboard")
      );
    }
    if (role && isHospitalStaff(role)) {
      return withHospitalTenant(
        request,
        redirectTo(request, homePathForRole(role))
      );
    }
  }

  // No guard → public (already authenticated user just refreshing session)
  if (!guard) {
    return supabaseResponse;
  }

  if (isPublicUnderGuard(pathname, guard)) {
    return supabaseResponse;
  }

  if (!user) {
    return withHospitalTenant(
      request,
      unauthorized(request, isApi, pathname)
    );
  }

  const role = await getRole();
  if (!roleAllowedOnPath(role, pathname)) {
    return withHospitalTenant(request, forbidden(request, isApi));
  }

  return supabaseResponse;
}
