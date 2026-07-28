import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

const faqSchema = z.object({
  question: z.string().min(3).max(300),
  answer: z.string().min(3).max(2000),
});

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  title: z.string().max(160).optional(),
  slug: z.string().max(120).optional().nullable(),
  department_id: z.string().uuid().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  qualifications: z.array(z.string()).optional(),
  degrees: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  specializations: z.array(z.string()).optional(),
  experience_years: z.coerce.number().min(0).max(80).optional(),
  experience_notes: z.string().max(2000).optional(),
  experience_timeline: z.array(z.string()).optional(),
  awards: z.array(z.string()).optional(),
  memberships: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  treatments: z.array(z.string()).optional(),
  services: z.array(z.string()).optional(),
  faqs: z.array(faqSchema).optional(),
  consultation_fee: z.coerce.number().min(0).optional(),
  video_consultation_fee: z.coerce.number().min(0).nullable().optional(),
  available_days: z.array(z.string()).optional(),
  time_slots: z.array(z.string()).optional(),
  consultation_timings: z.string().max(300).optional(),
  biography: z.string().max(8000).optional(),
  video_intro_url: z.string().nullable().optional(),
  is_featured: z.boolean().optional(),
  seo_title: z.string().max(160).nullable().optional(),
  seo_description: z.string().max(320).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  sort_order: z.coerce.number().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("hospital_doctors")
    .select("*, department:departments(*)")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (patch.slug !== undefined && patch.slug !== null) {
    patch.slug = slugify(String(patch.slug));
  } else if (patch.name && !patch.slug) {
    patch.slug = slugify(String(patch.name));
  }

  let { data, error } = await gate.supabase
    .from("hospital_doctors")
    .update(patch)
    .eq("id", params.id)
    .select("*, department:departments(*)")
    .single();

  if (error && /column|schema cache/i.test(error.message)) {
    const legacyKeys = [
      "name",
      "title",
      "department_id",
      "photo_url",
      "qualifications",
      "specializations",
      "experience_years",
      "experience_notes",
      "consultation_fee",
      "available_days",
      "time_slots",
      "biography",
      "status",
      "sort_order",
    ] as const;
    const legacy: Record<string, unknown> = {};
    for (const k of legacyKeys) {
      if (patch[k] !== undefined) legacy[k] = patch[k];
    }
    const retry = await gate.supabase
      .from("hospital_doctors")
      .update(legacy)
      .eq("id", params.id)
      .select("*, department:departments(*)")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { error } = await gate.supabase
    .from("hospital_doctors")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
