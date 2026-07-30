import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getPhase2Stats, globalSearch } from "@/lib/phase2/service";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const q = new URL(request.url).searchParams.get("q");
  if (q) {
    const results = await globalSearch(q, opts);
    return NextResponse.json({ data: results });
  }

  const stats = await getPhase2Stats(opts);
  return NextResponse.json({ data: stats });
}
