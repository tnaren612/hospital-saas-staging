import { NextResponse } from "next/server";
import {
  getCmsNavigation,
  getPublishedAnnouncement,
} from "@/lib/cms/service";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) {
    return NextResponse.json({
      data: { header: [], footer: [], utility: [], announcement: null },
    });
  }
  const [header, footer, utility, announcement] = await Promise.all([
    getCmsNavigation(tenant.hospitalId, "header"),
    getCmsNavigation(tenant.hospitalId, "footer"),
    getCmsNavigation(tenant.hospitalId, "utility"),
    getPublishedAnnouncement(tenant.hospitalId),
  ]);
  return NextResponse.json(
    { data: { header, footer, utility, announcement } },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
