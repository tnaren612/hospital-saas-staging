/**
 * GET /api/admin/tenant-audit — admin-only tenant isolation diagnostics
 */

import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { isAdmin } from "@/lib/auth/roles";
import { auditTenantColumns } from "@/lib/hospital/audit-tenant";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await getTenantContext();
  const audit = await auditTenantColumns();

  return NextResponse.json({
    tenant,
    audit,
    guidance:
      "Apply migration 026_hospital_id_rls_foundation.sql if hospital_id columns are missing. Aim for nullHospitalRows=0 on all clinical tables.",
  });
}
