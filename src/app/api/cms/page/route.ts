import { NextResponse } from "next/server";
import { CMS_PAGE_KEYS, type CmsPageKey } from "@/lib/cms/types";
import { getPublishedCmsPage } from "@/lib/cms/service";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") as CmsPageKey | null;
  if (!key || !(CMS_PAGE_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: "Invalid page key" }, { status: 400 });
  }
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ data: null });
  const data = await getPublishedCmsPage(tenant.hospitalId, key);
  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
