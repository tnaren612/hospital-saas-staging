import { NextResponse } from "next/server";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/supabase/env";
import { getAllProviderStatuses } from "@/lib/providers/config";
import { requireHmsAdmin } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * H-11: Public probe returns minimal ok only.
 * ?deep=1 requires staff session for provider recon details.
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  if (!deep) {
    return NextResponse.json(
      {
        ok: true,
        service: "hospital-erp",
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // Deep health — staff only
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const supabaseUrl = Boolean(getSupabaseUrl());
  const serviceRole = Boolean(getServiceRoleKey());
  const providers = getAllProviderStatuses();

  const body = {
    ok: true,
    service: "hospital-erp",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    checks: {
      supabase: {
        configured: supabaseUrl,
        serviceRole,
      },
      payments: {
        razorpay: providers.razorpay.configured,
        mode: providers.razorpay.mode,
      },
      notifications: {
        email: providers.email.configured,
        sms: providers.sms.configured,
        whatsapp: providers.whatsapp.configured,
      },
      analytics: {
        ga4: providers.analytics.configured,
        webVitals: true,
      },
    },
    providers,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
