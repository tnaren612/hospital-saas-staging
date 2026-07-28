import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

const faqSchema = z.object({
  question: z.string().min(3).max(300),
  answer: z.string().min(3).max(2000),
});

const schema = z.object({
  name: z.string().min(2).max(120),
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

function buildInsert(d: z.infer<typeof schema>) {
  const slug =
    (d.slug && slugify(d.slug)) ||
    (d.name ? slugify(d.name) : null);

  return {
    name: d.name.trim(),
    title: d.title || "Consultant",
    slug,
    department_id: d.department_id ?? null,
    photo_url: d.photo_url ?? null,
    qualifications: d.qualifications || [],
    degrees: d.degrees || d.qualifications || [],
    certifications: d.certifications || [],
    specializations: d.specializations || [],
    experience_years: d.experience_years ?? 0,
    experience_notes: d.experience_notes || "",
    experience_timeline: d.experience_timeline || [],
    awards: d.awards || [],
    memberships: d.memberships || [],
    languages: d.languages || ["English", "Telugu"],
    treatments: d.treatments || [],
    services: d.services || [],
    faqs: d.faqs || [],
    consultation_fee: d.consultation_fee ?? 500,
    video_consultation_fee: d.video_consultation_fee ?? null,
    available_days: d.available_days || [
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ],
    time_slots: d.time_slots || [
      "09:00 AM",
      "10:00 AM",
      "11:00 AM",
      "05:00 PM",
      "06:00 PM",
    ],
    consultation_timings: d.consultation_timings || "",
    biography: d.biography || "",
    video_intro_url: d.video_intro_url ?? null,
    is_featured: d.is_featured ?? false,
    seo_title: d.seo_title ?? null,
    seo_description: d.seo_description ?? null,
    status: d.status || "active",
    sort_order: d.sort_order ?? 0,
  };
}

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const departmentId = searchParams.get("department_id");
  const q = searchParams.get("q")?.trim();

  let query = gate.supabase
    .from("hospital_doctors")
    .select("*, department:departments(*)")
    .order("sort_order")
    .order("name");

  if (status) query = query.eq("status", status);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = data || [];
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(
      (d) =>
        String(d.name).toLowerCase().includes(lower) ||
        String(d.title || "").toLowerCase().includes(lower) ||
        String(d.slug || "").toLowerCase().includes(lower) ||
        (Array.isArray(d.specializations) &&
          d.specializations.some((s: string) =>
            s.toLowerCase().includes(lower)
          ))
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

  const payload = buildInsert(parsed.data);
  let { data, error } = await gate.supabase
    .from("hospital_doctors")
    .insert(payload)
    .select("*, department:departments(*)")
    .single();

  // Graceful if Phase 2 columns not migrated yet
  if (error && /column|schema cache/i.test(error.message)) {
    const legacy = {
      name: payload.name,
      title: payload.title,
      department_id: payload.department_id,
      photo_url: payload.photo_url,
      qualifications: payload.qualifications,
      specializations: payload.specializations,
      experience_years: payload.experience_years,
      experience_notes: payload.experience_notes,
      consultation_fee: payload.consultation_fee,
      available_days: payload.available_days,
      time_slots: payload.time_slots,
      biography: payload.biography,
      status: payload.status,
      sort_order: payload.sort_order,
    };
    const retry = await gate.supabase
      .from("hospital_doctors")
      .insert(legacy)
      .select("*, department:departments(*)")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
