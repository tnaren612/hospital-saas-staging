import { type NextRequest, NextResponse } from "next/server";
import { getPatientDashboard } from "@/lib/patient/service";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
  createTokenSupabaseClient,
} from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabase =
      isSupabaseBackendEnabled() && hasSupabaseConfig()
        ? accessToken
          ? createTokenSupabaseClient(accessToken)
          : await createServerSupabaseClient()
        : undefined;
    const tokenAuth = accessToken
      ? await createServiceRoleClient().auth.getUser(accessToken)
      : null;
    if (accessToken && (tokenAuth?.error || !tokenAuth?.data.user)) {
      return NextResponse.json(
        {
          error: "Invalid patient session",
          detail: tokenAuth?.error?.message || "Authenticated user not found",
        },
        { status: 401 }
      );
    }
    const authenticatedUser = tokenAuth?.data.user;
    const data = await getPatientDashboard(
      supabase,
      accessToken,
      authenticatedUser ?? undefined
    );
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
