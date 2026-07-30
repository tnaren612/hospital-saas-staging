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
  name: z.string().min(2).max(160).optional(),
  slug: z.string().max(160).optional().nullable(),
  subtitle: z.string().max(200).optional(),
  short_description: z.string().max(400).optional(),
  description: z.string().max(8000).optional(),
  price: z.coerce.number().min(0).optional(),
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

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("health_packages")
    .select("*, department:departments(id, name, slug)")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (patch.slug) patch.slug = slugify(String(patch.slug));
  else if (patch.name && patch.slug === undefined) {
    /* keep existing slug unless provided */
  }

  const { data, error } = await gate.supabase
    .from("health_packages")
    .update(patch)
    .eq("id", params.id)
    .select("*, department:departments(id, name, slug)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  clearPackageCache();
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { error } = await gate.supabase
    .from("health_packages")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  clearPackageCache();
  return NextResponse.json({ ok: true });
}
