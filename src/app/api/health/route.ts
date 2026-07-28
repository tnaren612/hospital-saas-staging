import { NextResponse } from "next/server";
import { getSupabaseUrl, getServiceRoleKey } from "@/lib/supabase/env";
import { getAllProviderStatuses } from "@/lib/providers/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Lightweight readiness probe for Vercel / uptime monitors.
 * Does not expose secrets.
 */
export async function GET() {
  const supabaseUrl = Boolean(getSupabaseUrl());
  const serviceRole = Boolean(getServiceRoleKey());
  const providers = getAllProviderStatuses();

  const body = {
    ok: true,
    service: "sri-srinivasa-hospital",
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
