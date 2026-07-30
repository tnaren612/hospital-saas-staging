import { NextResponse } from "next/server";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";
import { doctorUpdateSchema } from "@/lib/doctors/validation";
import { DOCTOR_WRITE_ROLES } from "@/lib/doctors/constants";
import { isAdmin, canAccessFeature } from "@/lib/auth/roles";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

function canWriteDoctors(role: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  const r = String(role || "").toLowerCase();
  return (DOCTOR_WRITE_ROLES as readonly string[]).includes(r);
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (
    gate.session &&
    !canAccessFeature(role, "doctors") &&
    !isAdmin(role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await gate.supabase
    .from("hospital_doctors")
    .select("*, department:departments(*)")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(DOCTOR_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWriteDoctors(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = doctorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (patch.slug !== undefined && patch.slug !== null) {
    patch.slug = slugify(String(patch.slug));
  } else if (patch.name && !patch.slug) {
    patch.slug = slugify(String(patch.name));
  }
  // Never allow client to clear soft-delete via PATCH without restore
  delete patch.deleted_at;

  let { data, error } = await gate.supabase
    .from("hospital_doctors")
    .update(patch)
    .eq("id", params.id)
    .is("deleted_at", null)
    .select("*, department:departments(*)")
    .single();

  if (error && /column|schema cache|deleted_at/i.test(error.message)) {
    const legacyKeys = [
      "name",
      "title",
      "slug",
      "department_id",
      "photo_url",
      "qualifications",
      "degrees",
      "certifications",
      "specializations",
      "experience_years",
      "experience_notes",
      "experience_timeline",
      "awards",
      "memberships",
      "languages",
      "treatments",
      "services",
      "faqs",
      "consultation_fee",
      "video_consultation_fee",
      "available_days",
      "time_slots",
      "consultation_timings",
      "biography",
      "video_intro_url",
      "is_featured",
      "seo_title",
      "seo_description",
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

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: role || undefined,
    success: true,
    metadata: { action: "doctor_update", doctor_id: params.id },
  });

  return NextResponse.json({ data });
}

/**
 * Soft-delete preferred. Hard delete only if soft-delete column missing.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(DOCTOR_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWriteDoctors(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete: set deleted_at + inactive
  const soft = await gate.supabase
    .from("hospital_doctors")
    .update({
      deleted_at: new Date().toISOString(),
      status: "inactive",
      is_featured: false,
    })
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (soft.error && /column|schema cache|deleted_at/i.test(soft.error.message)) {
    // Fallback hard delete only when migration not applied
    const { error } = await gate.supabase
      .from("hospital_doctors")
      .delete()
      .eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else if (soft.error) {
    return NextResponse.json({ error: soft.error.message }, { status: 400 });
  } else if (!soft.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: role || undefined,
    success: true,
    metadata: { action: "doctor_soft_delete", doctor_id: params.id },
  });

  return NextResponse.json({ ok: true, soft: true });
}
