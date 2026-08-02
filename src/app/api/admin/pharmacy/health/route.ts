import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { classifyFetchError } from "@/lib/pharmacy/offline/cloud-core";

export const dynamic = "force-dynamic";

/**
 * Read-only cloud-reachability probe for the Pharmacy POS.
 *
 * Supabase mode: one head-count query against pharmacy_settings — returns
 * ok:true when reachable, 503 with a classified `kind` when the cloud backend
 * is unreachable (network) or misbehaving (server). 401/403 from the auth
 * gate pass through untouched so a dead session is never mistaken for
 * "offline". Local mode (no Supabase keys): always ok — sync is served by the
 * local store and there is no cloud to wait on.
 */
export async function GET() {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;

  if (!hasSupabaseConfig() || !gate.supabase) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  try {
    await gate.supabase
      .from("pharmacy_settings")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return NextResponse.json({ ok: true, mode: "supabase" });
  } catch (err) {
    const kind = classifyFetchError(err);
    return NextResponse.json(
      {
        ok: false,
        mode: "supabase",
        kind,
        error: err instanceof Error ? err.message : "unreachable",
      },
      { status: 503 }
    );
  }
}
