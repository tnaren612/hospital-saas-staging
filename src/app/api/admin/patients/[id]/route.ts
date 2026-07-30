import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { mapDbAppointment } from "@/lib/admin/appointments";
import {
  patientUpdateSchema,
  toPatientRow,
  PATIENT_WRITE_ROLES,
  type PatientCreateInput,
} from "@/lib/patients/validation";
import { canAccessFeature, isAdmin } from "@/lib/auth/roles";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

function canWritePatients(role: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  return (PATIENT_WRITE_ROLES as readonly string[]).includes(
    String(role || "").toLowerCase()
  );
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const { data: patient, error } = await gate.supabase
    .from("hospital_patients")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (patient.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: apts } = await gate.supabase
    .from("appointments")
    .select("*")
    .eq("phone", patient.phone)
    .order("date", { ascending: false });

  return NextResponse.json({
    data: {
      ...patient,
      appointments: (apts || []).map((r) =>
        mapDbAppointment(r as Record<string, unknown>)
      ),
    },
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(PATIENT_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWritePatients(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patientUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Build partial update from known fields only
  const partial = parsed.data as Partial<PatientCreateInput>;
  const row = toPatientRow({
    full_name: partial.full_name || "Patient",
    phone: partial.phone || "6000000000",
    ...partial,
  } as PatientCreateInput);

  // Only include keys that were actually sent
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(partial) as (keyof typeof partial)[]) {
    if (partial[key] !== undefined) {
      // Map through row for normalized values
      if (key in row) {
        patch[key] = (row as Record<string, unknown>)[key as string];
      }
    }
  }
  // Always sync emergency_contact if structured fields present
  if (
    partial.emergency_contact_name !== undefined ||
    partial.emergency_contact_phone !== undefined
  ) {
    patch.emergency_contact = row.emergency_contact;
    patch.emergency_contact_name = row.emergency_contact_name;
    patch.emergency_contact_phone = row.emergency_contact_phone;
  }

  let { data, error } = await gate.supabase
    .from("hospital_patients")
    .update(patch)
    .eq("id", params.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error && /column|schema cache|deleted_at/i.test(error.message)) {
    const legacy: Record<string, unknown> = { ...patch };
    delete legacy.allergies;
    delete legacy.emergency_contact_name;
    delete legacy.emergency_contact_phone;
    delete legacy.deleted_at;
    const retry = await gate.supabase
      .from("hospital_patients")
      .update(legacy)
      .eq("id", params.id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
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
    metadata: { action: "patient_update", patient_id: params.id },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(PATIENT_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWritePatients(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const soft = await gate.supabase
    .from("hospital_patients")
    .update({
      deleted_at: new Date().toISOString(),
      status: "inactive",
    })
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (soft.error && /column|schema cache|deleted_at/i.test(soft.error.message)) {
    const { error } = await gate.supabase
      .from("hospital_patients")
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
    metadata: { action: "patient_soft_delete", patient_id: params.id },
  });

  return NextResponse.json({ ok: true, soft: true });
}
