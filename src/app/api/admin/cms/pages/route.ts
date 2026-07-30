import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";
import { isAdmin } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { CMS_PAGE_KEYS } from "@/lib/cms/types";
import { listCmsPages, saveCmsPage } from "@/lib/cms/service";

export const dynamic = "force-dynamic";

const blockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(80),
  title: z.string().max(300).optional(),
  subtitle: z.string().max(600).optional(),
  body: z.string().max(50_000).optional(),
  image_url: z.string().max(2_000).optional(),
  data: z.record(z.unknown()).optional(),
});

const pageSchema = z.object({
  page_key: z.enum(CMS_PAGE_KEYS),
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^\/?[a-z0-9][a-z0-9/_-]*$/),
  status: z.enum(["draft", "published", "archived"]),
  content: z.object({ blocks: z.array(blockSchema).max(100) }),
  seo: z.object({
    title: z.string().max(300).optional(),
    description: z.string().max(1_000).optional(),
    image_url: z.string().max(2_000).optional(),
    keywords: z.string().max(1_000).optional(),
  }),
});

async function adminGate() {
  const gate = await requireHmsAdmin();
  if (gate.error) return { error: gate.error, gate };
  if (!isAdmin(gate.session?.profile.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      gate,
    };
  }
  return { error: null, gate };
}

export async function GET() {
  const auth = await adminGate();
  if (auth.error) return auth.error;
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) {
    return NextResponse.json({ error: "Tenant not configured" }, { status: 409 });
  }
  return NextResponse.json({ data: await listCmsPages(tenant.hospitalId) });
}

export async function PUT(request: Request) {
  const auth = await adminGate();
  if (auth.error) return auth.error;
  const parsed = pageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) {
    return NextResponse.json({ error: "Tenant not configured" }, { status: 409 });
  }
  const data = await saveCmsPage({
    hospitalId: tenant.hospitalId,
    pageKey: parsed.data.page_key,
    title: parsed.data.title,
    slug: parsed.data.slug.replace(/^\/+/, ""),
    status: parsed.data.status,
    content: parsed.data.content,
    seo: parsed.data.seo,
    actorId: auth.gate.session?.user.id,
  });
  return NextResponse.json({ data, ok: true });
}
