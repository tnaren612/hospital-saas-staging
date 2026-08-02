import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { getSaleByNumber } from "@/lib/pharmacy/service";

export const dynamic = "force-dynamic";

/**
 * Fetch a single sale by its sale_number — powers receipt reprint + payment
 * history detail. Tenant-isolated and RBAC-gated.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const tenant = await getTenantContext();
  const { number } = await params;
  const sale = await getSaleByNumber(number, { hospitalId: tenant.hospitalId });
  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }
  return NextResponse.json({ data: sale });
}
