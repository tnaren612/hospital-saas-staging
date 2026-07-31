import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { listBranches } from "@/lib/pharmacy/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const tenant = await getTenantContext();
  const data = await listBranches({ hospitalId: tenant.hospitalId });
  return NextResponse.json({ data });
}
