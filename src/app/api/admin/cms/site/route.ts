import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";
import { isAdmin } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import {
  getCmsNavigation,
  listCmsAnnouncements,
  saveCmsAnnouncement,
  saveCmsNavigation,
} from "@/lib/cms/service";

export const dynamic = "force-dynamic";

const navigationItemSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  href: z.string().min(1).max(2_000),
  order: z.number().int().min(0).max(1_000),
  visible: z.boolean(),
  external: z.boolean().optional(),
});

const updateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigation"),
    location: z.enum(["header", "footer", "utility"]),
    items: z.array(navigationItemSchema).max(50),
  }),
  z.object({
    kind: z.literal("announcement"),
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(2_000),
    link_url: z.string().max(2_000).optional(),
    starts_at: z.string().datetime().nullable().optional(),
    ends_at: z.string().datetime().nullable().optional(),
    status: z.enum(["draft", "published", "archived"]),
  }),
]);

async function context() {
  const gate = await requireHmsAdmin();
  if (gate.error) return { error: gate.error, hospitalId: "", actorId: "" };
  if (!isAdmin(gate.session?.profile.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      hospitalId: "",
      actorId: "",
    };
  }
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) {
    return {
      error: NextResponse.json({ error: "Tenant not configured" }, { status: 409 }),
      hospitalId: "",
      actorId: "",
    };
  }
  return {
    error: null,
    hospitalId: tenant.hospitalId,
    actorId: gate.session?.user.id || "",
  };
}

export async function GET() {
  const auth = await context();
  if (auth.error) return auth.error;
  const [header, footer, utility, announcements] = await Promise.all([
    getCmsNavigation(auth.hospitalId, "header"),
    getCmsNavigation(auth.hospitalId, "footer"),
    getCmsNavigation(auth.hospitalId, "utility"),
    listCmsAnnouncements(auth.hospitalId),
  ]);
  return NextResponse.json({
    data: { navigation: { header, footer, utility }, announcements },
  });
}

export async function PUT(request: Request) {
  const auth = await context();
  if (auth.error) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (parsed.data.kind === "navigation") {
    const data = await saveCmsNavigation({
      hospitalId: auth.hospitalId,
      location: parsed.data.location,
      items: parsed.data.items,
      actorId: auth.actorId,
    });
    return NextResponse.json({ data, ok: true });
  }
  const data = await saveCmsAnnouncement({
    hospitalId: auth.hospitalId,
    id: parsed.data.id,
    title: parsed.data.title,
    message: parsed.data.message,
    linkUrl: parsed.data.link_url,
    startsAt: parsed.data.starts_at,
    endsAt: parsed.data.ends_at,
    status: parsed.data.status,
  });
  return NextResponse.json({ data, ok: true });
}
