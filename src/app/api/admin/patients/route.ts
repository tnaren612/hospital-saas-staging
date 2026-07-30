import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  patientCreateSchema,
  toPatientRow,
  PATIENT_WRITE_ROLES,
} from "@/lib/patients/validation";
import { canAccessFeature, isAdmin } from "@/lib/auth/roles";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

function canWritePatients(role: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  return (PATIENT_WRITE_ROLES as readonly string[]).includes(
    String(role || "").toLowerCase()
  );
}

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (
    gate.session &&
    !canAccessFeature(role, "patients") &&
    !isAdmin(role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const status = searchParams.get("status");

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("hospital_patients")
    .select("*")
    .order("created_at", { ascending: false });

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  // Soft-delete filter (graceful if column missing)
  query = query.is("deleted_at", null);
  if (status) query = query.eq("status", status);

  let { data, error } = await query;

  if (error && /deleted_at|column/i.test(error.message)) {
    let fallback = gate.supabase
      .from("hospital_patients")
      .select("*")
      .order("created_at", { ascending: false });
    if (status) fallback = fallback.eq("status", status);
    const retry = await fallback;
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = data || [];
  if (q) {
    rows = rows.filter(
      (p) =>
        String(p.full_name).toLowerCase().includes(q) ||
        String(p.phone).includes(q) ||
        String(p.email || "")
          .toLowerCase()
          .includes(q)
    );
  }

  const phones = rows.map((r) => r.phone);
  const apptByPhone: Record<string, number> = {};
  if (phones.length) {
    const { data: apts } = await gate.supabase
      .from("appointments")
      .select("phone")
      .in("phone", phones);
    (apts || []).forEach((a) => {
      apptByPhone[a.phone] = (apptByPhone[a.phone] || 0) + 1;
    });
  }

  const enriched = rows.map((p) => ({
    ...p,
    appointment_count: apptByPhone[p.phone] || 0,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(PATIENT_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWritePatients(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = checkAuthRateLimit(
    `patient-create:${gate.session?.user.id || "demo"}`
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patientCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await getTenantContext();
  const row = withHospitalId(
    toPatientRow(parsed.data) as Record<string, unknown>,
    tenant.hospitalId
  );
  let { data, error } = await gate.supabase
    .from("hospital_patients")
    .insert(row)
    .select()
    .single();

  if (error && /column|schema cache/i.test(error.message)) {
    const legacy = { ...row } as Record<string, unknown>;
    delete legacy.allergies;
    delete legacy.emergency_contact_name;
    delete legacy.emergency_contact_phone;
    delete legacy.hospital_id;
    const retry = await gate.supabase
      .from("hospital_patients")
      .insert(legacy)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    // Unique phone conflict
    if (/unique|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { error: "A patient with this phone already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: role || undefined,
    success: true,
    metadata: { action: "patient_create", patient_id: data?.id },
  });

  return NextResponse.json({ data }, { status: 201 });
}
