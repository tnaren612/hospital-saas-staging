/**
 * Public hospital config (no secrets) — branding, contact, modules, localization.
 * Cached aggressively for appointment / marketing pages.
 */

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getHospitalConfig } from "@/lib/hospital/service";
import {
  HOSPITAL_SLUG_COOKIE,
  HOSPITAL_SLUG_HEADER,
  resolveHospitalSlug,
} from "@/lib/hospital/resolve-tenant";
import { toPublicHospitalConfig } from "@/lib/hospital/public-config";

// Allow edge caching of responses (CDN)
export const revalidate = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hdrs = await headers();
  const cookieStore = await cookies();
  const slug = resolveHospitalSlug({
    host: hdrs.get("host"),
    cookieSlug: cookieStore.get(HOSPITAL_SLUG_COOKIE)?.value,
    querySlug: url.searchParams.get("slug") || url.searchParams.get("hospital"),
    headerSlug: hdrs.get(HOSPITAL_SLUG_HEADER),
    allowClientOverride: process.env.NODE_ENV !== "production",
  });

  // Read-only — no ensureDefaultHospital on public path
  const config = await getHospitalConfig({ slug, ensureExists: false });

  const publicConfig = toPublicHospitalConfig(config);

  return NextResponse.json(
    { data: publicConfig },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=120, stale-while-revalidate=600, max-age=60",
      },
    }
  );
}
