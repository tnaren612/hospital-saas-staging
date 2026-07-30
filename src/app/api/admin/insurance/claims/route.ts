import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  insuranceClaimCreateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";
type ClaimListDetail = {
  patient_insurance?: { policy_number?: string; insurance_providers?: { provider_name?: string; id?: string } | null } | null;
  hospital_patients?: { full_name?: string; phone?: string } | null;
};

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patient_id");
  const status = searchParams.get("status");
  const providerId = searchParams.get("provider_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("insurance_claims")
    .select(`
      *,
      patient_insurance!inner(
        policy_number,
        insurance_providers(provider_name, id)
      ),
      hospital_patients(full_name, phone)
    `)
    .order("created_at", { ascending: false });

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (patientId) query = query.eq("patient_id", patientId);
  if (status) query = query.eq("status", status);
  if (providerId) query = query.eq("patient_insurance.provider_id", providerId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const enriched = (data || []).map((r) => ({
    ...r,
    policy_number: (r as unknown as ClaimListDetail).patient_insurance?.policy_number || null,
    provider_name: (r as unknown as ClaimListDetail).patient_insurance?.insurance_providers?.provider_name || null,
    provider_id: (r as unknown as ClaimListDetail).patient_insurance?.insurance_providers?.id || null,
    patient_name: (r as unknown as ClaimListDetail).hospital_patients?.full_name || null,
    patient_phone: (r as unknown as ClaimListDetail).hospital_patients?.phone || null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = insuranceClaimCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Validate patient
  const { data: patient } = await gate.supabase
    .from("hospital_patients")
    .select("id, full_name, phone, email")
    .eq("id", parsed.data.patient_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Patient not found or inactive" }, { status: 400 });
  }

  // Validate insurance policy
  const { data: policy } = await gate.supabase
    .from("patient_insurance")
    .select("id, policy_number, coverage_from, coverage_to, is_active, insurance_providers(provider_name)")
    .eq("id", parsed.data.patient_insurance_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!policy) {
    return NextResponse.json({ error: "Active insurance policy required" }, { status: 400 });
  }

  // Check for duplicate claims
  const { data: existing } = await gate.supabase
    .from("insurance_claims")
    .select("id")
    .eq("patient_insurance_id", parsed.data.patient_insurance_id)
    .eq("total_bill_amount", parsed.data.total_bill_amount)
    .not("status", "in", '("cancelled")')
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A claim with this policy and amount already exists. Duplicate claims not allowed." },
      { status: 409 }
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
      pre_authorization_id: parsed.data.pre_authorization_id || null,
      encounter_id: parsed.data.encounter_id || null,
      total_bill_amount: parsed.data.total_bill_amount,
      claim_amount: parsed.data.claim_amount,
      deductible_amount: parsed.data.deductible_amount,
      copay_amount: parsed.data.copay_amount,
      notes: parsed.data.notes || null,
      diagnosis_codes: parsed.data.diagnosis_codes || null,
      procedure_codes: parsed.data.procedure_codes || null,
    },
    tenant.hospitalId
  );

  const { data, error } = await gate.supabase
    .from("insurance_claims")
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
      action: "insurance_claim_create",
      claim_id: data?.id,
      patient_id: parsed.data.patient_id,
    },
  });

  // Notify: claim draft created
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
          message: `An insurance claim of ₹${parsed.data.claim_amount} has been initiated for you. Claim #${data?.claim_number || ""}.`,
          hospitalName: "",
        },
      });
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
