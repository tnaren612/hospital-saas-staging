import { NextResponse } from "next/server";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";
import {
  doctorCreateSchema,
  buildDoctorInsertPayload,
} from "@/lib/doctors/validation";
import { DOCTOR_WRITE_ROLES } from "@/lib/doctors/constants";
import { isAdmin, canAccessFeature } from "@/lib/auth/roles";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

function canWriteDoctors(role: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  const r = String(role || "").toLowerCase();
  return (DOCTOR_WRITE_ROLES as readonly string[]).includes(r);
}

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  // Read: staff with doctors feature, or any admin/manager/hr/receptionist
  const role = gate.session?.profile.role;
  if (
    gate.session &&
    !canAccessFeature(role, "doctors") &&
    !isAdmin(role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const departmentId = searchParams.get("department_id");
  const q = searchParams.get("q")?.trim();
  const includeDeleted = searchParams.get("include_deleted") === "1";

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("hospital_doctors")
    .select("*, department:departments(*)")
    .order("sort_order")
    .order("name");

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }
  if (status) query = query.eq("status", status);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) {
    // Column deleted_at may not exist pre-migration — retry without filter
    if (/deleted_at|column/i.test(error.message)) {
      let fallback = gate.supabase
        .from("hospital_doctors")
        .select("*, department:departments(*)")
        .order("sort_order")
        .order("name");
      if (status) fallback = fallback.eq("status", status);
      if (departmentId) fallback = fallback.eq("department_id", departmentId);
      const retry = await fallback;
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 400 });
      }
      let rows = retry.data || [];
      if (q) rows = filterByQ(rows, q);
      return NextResponse.json({ data: rows });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let rows = data || [];
  if (q) rows = filterByQ(rows, q);

  return NextResponse.json({ data: rows });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterByQ(rows: any[], q: string) {
  const lower = q.toLowerCase();
  return rows.filter(
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

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(DOCTOR_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWriteDoctors(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = checkAuthRateLimit(
    `doctor-create:${gate.session?.user.id || "demo"}`
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = doctorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await getTenantContext();
  const payload = withHospitalId(
    buildDoctorInsertPayload(parsed.data, slugify) as Record<string, unknown>,
    tenant.hospitalId
  );
  let { data, error } = await gate.supabase
    .from("hospital_doctors")
    .insert(payload)
    .select("*, department:departments(*)")
    .single();

  // Graceful if Phase 3 columns not migrated yet
  if (error && /column|schema cache/i.test(error.message)) {
    const legacyBase = { ...payload } as Record<string, unknown>;
    delete legacyBase.consultation_types;
    delete legacyBase.profile_user_id;
    delete legacyBase.deleted_at;
    delete legacyBase.hospital_id;
    const retry = await gate.supabase
      .from("hospital_doctors")
      .insert(legacyBase)
      .select("*, department:departments(*)")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    email: gate.session?.profile.email,
    role: role || undefined,
    success: true,
    metadata: {
      action: "doctor_create",
      doctor_id: data?.id,
      doctor_name: data?.name,
    },
  });

  return NextResponse.json({ data }, { status: 201 });
}
