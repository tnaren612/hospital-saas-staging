import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { getHospitalConfig } from "@/lib/hospital/service";
import {
  getPharmacyDashboardStats,
  getPharmacySettings,
  listBranches,
} from "@/lib/pharmacy/service";

export const dynamic = "force-dynamic";

/**
 * One-shot payload for the Pharmacy Dashboard + POS bootstrap:
 * stats, settings, branches, and the hospital config for branding.
 */
export async function GET() {
  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const [stats, settings, branches, hospital] = await Promise.all([
    getPharmacyDashboardStats(opts),
    getPharmacySettings(opts),
    listBranches(opts),
    getHospitalConfig({ slug: tenant.slug, bypassCache: true }),
  ]);

  return NextResponse.json({
    data: { stats, settings, branches, hospital },
  });
}
