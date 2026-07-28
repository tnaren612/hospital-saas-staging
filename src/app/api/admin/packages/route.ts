import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";
import { clearPackageCache } from "@/lib/health-packages/service";

export const dynamic = "force-dynamic";

const faqSchema = z.object({
  question: z.string().min(2).max(300),
  answer: z.string().min(2).max(2000),
});

const schema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().max(160).optional().nullable(),
  subtitle: z.string().max(200).optional(),
  short_description: z.string().max(400).optional(),
  description: z.string().max(8000).optional(),
  price: z.coerce.number().min(0),
  offer_price: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().max(8).optional(),
  department_id: z.string().uuid().nullable().optional(),
  featured: z.boolean().optional(),
  popular: z.boolean().optional(),
  package_type: z.string().max(40).optional(),
  duration: z.string().max(120).optional(),
  report_time: z.string().max(120).optional(),
  preparation: z.string().max(4000).optional(),
  tests_included: z.array(z.string()).optional(),
  services_included: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  instructions: z.array(z.string()).optional(),
  faqs: z.array(faqSchema).optional(),
  hero_image: z.string().optional(),
  banner_image: z.string().optional(),
  gallery_images: z.array(z.string()).optional(),
  icon: z.string().optional(),
  brochure_pdf: z.string().optional(),
  booking_enabled: z.boolean().optional(),
  is_active: z.boolean().optional(),
  display_order: z.coerce.number().optional(),
  seo_title: z.string().max(160).nullable().optional(),
  seo_description: z.string().max(320).nullable().optional(),
  meta_keywords: z.array(z.string()).optional(),
  payment_enabled: z.boolean().optional(),
  payment_amount: z.coerce.number().min(0).nullable().optional(),
});

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const { data, error } = await gate.supabase
    .from("health_packages")
    .select("*, department:departments(id, name, slug)")
    .order("display_order")
    .order("name");

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint:
          /schema cache|does not exist/i.test(error.message)
            ? "Run migration 010_health_packages_phase4.sql"
            : undefined,
      },
      { status: 400 }
    );
  }

  let rows = data || [];
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        String(r.name).toLowerCase().includes(lower) ||
        String(r.slug).toLowerCase().includes(lower) ||
        String(r.package_type || "").toLowerCase().includes(lower)
    );
  }

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const slug = slugify(d.slug || d.name);

  const { data, error } = await gate.supabase
    .from("health_packages")
    .insert({
      name: d.name.trim(),
      slug,
      subtitle: d.subtitle || "",
      short_description: d.short_description || "",
      description: d.description || "",
      price: d.price,
      offer_price: d.offer_price ?? null,
      currency: d.currency || "INR",
      department_id: d.department_id ?? null,
      featured: d.featured ?? false,
      popular: d.popular ?? false,
      package_type: d.package_type || "general",
      duration: d.duration || "",
      report_time: d.report_time || "",
      preparation: d.preparation || "",
      tests_included: d.tests_included || [],
      services_included: d.services_included || [],
      benefits: d.benefits || [],
      instructions: d.instructions || [],
      faqs: d.faqs || [],
      hero_image: d.hero_image || "",
      banner_image: d.banner_image || "",
      gallery_images: d.gallery_images || [],
      icon: d.icon || "",
      brochure_pdf: d.brochure_pdf || "",
      booking_enabled: d.booking_enabled !== false,
      is_active: d.is_active !== false,
      display_order: d.display_order ?? 0,
      seo_title: d.seo_title ?? null,
      seo_description: d.seo_description ?? null,
      meta_keywords: d.meta_keywords || [],
      payment_enabled: d.payment_enabled ?? false,
      payment_amount: d.payment_amount ?? null,
    })
    .select("*, department:departments(id, name, slug)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  clearPackageCache();
  return NextResponse.json({ data }, { status: 201 });
}
