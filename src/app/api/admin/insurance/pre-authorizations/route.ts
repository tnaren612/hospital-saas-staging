import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  preAuthorizationCreateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";
type PreauthorizationDetail = {
  patient_insurance?: { policy_number?: string; insurance_providers?: { provider_name?: string } | null } | null;
  hospital_patients?: { full_name?: string } | null;
};

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patient_id");
  const status = searchParams.get("status");

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("pre_authorizations")
    .select(`
      *,
      patient_insurance!inner(
        policy_number,
        insurance_providers(provider_name)
      ),
      hospital_patients(full_name)
    `)
    .order("created_at", { ascending: false });

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (patientId) {
    query = query.eq("patient_id", patientId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const enriched = (data || []).map((r) => ({
    ...r,
    policy_number: (r as unknown as PreauthorizationDetail).patient_insurance?.policy_number || null,
    provider_name: (r as unknown as PreauthorizationDetail).patient_insurance?.insurance_providers?.provider_name || null,
    patient_name: (r as unknown as PreauthorizationDetail).hospital_patients?.full_name || null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = preAuthorizationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Validate patient exists and is active
  const { data: patient } = await gate.supabase
    .from("hospital_patients")
    .select("id, full_name, phone, email")
    .eq("id", parsed.data.patient_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Patient not found or inactive" }, { status: 400 });
  }

  // Validate patient insurance policy is active and verified
  const { data: policy } = await gate.supabase
    .from("patient_insurance")
    .select("id, policy_number, coverage_from, coverage_to, insurance_providers(provider_name)")
    .eq("id", parsed.data.patient_insurance_id)
    .eq("is_active", true)
    .eq("verification_status", "verified")
    .maybeSingle();

  if (!policy) {
    return NextResponse.json(
      { error: "Active and verified insurance policy required" },
      { status: 400 }
    );
  }

  // Validate coverage dates
  const today = new Date().toISOString().slice(0, 10);
  if (policy.coverage_to < today) {
    return NextResponse.json(
      { error: "Insurance policy has expired" },
      { status: 400 }
    );
  }

  // Validate encounter if provided
  if (parsed.data.encounter_id) {
    const { data: encounter } = await gate.supabase
      .from("clinical_encounters")
      .select("id")
      .eq("id", parsed.data.encounter_id)
      .maybeSingle();

    if (!encounter) {
      return NextResponse.json({ error: "Encounter not found" }, { status: 400 });
    }
  }

  const tenant = await getTenantContext();
  const row = withHospitalId(
    {
      patient_id: parsed.data.patient_id,
      patient_insurance_id: parsed.data.patient_insurance_id,
      encounter_id: parsed.data.encounter_id || null,
      treatment_type: parsed.data.treatment_type.trim(),
      diagnosis_code: parsed.data.diagnosis_code || null,
      procedure_code: parsed.data.procedure_code || null,
      estimated_amount: parsed.data.estimated_amount,
      clinical_notes: parsed.data.clinical_notes || null,
      valid_from: parsed.data.valid_from || null,
      valid_to: parsed.data.valid_to || null,
    },
    tenant.hospitalId
  );

  const { data, error } = await gate.supabase
    .from("pre_authorizations")
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: {
      action: "preauthorization_create",
      preauth_id: data?.id,
      patient_id: parsed.data.patient_id,
    },
  });

  // Send notification: preauthorization requested
  if (patient.phone) {
    try {
      const notify = getNotificationService();
      await notify.send({
        channel: "whatsapp",
        templateId: "generic",
        recipient: patient.phone,
        force: true,
        vars: {
          patientName: patient.full_name,
          message: `Your pre-authorization request for ${parsed.data.treatment_type} has been submitted. Amount: ₹${parsed.data.estimated_amount}.`,
          hospitalName: "",
        },
      });
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
