import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  patientInsuranceCreateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patient_id");
  const activeOnly = searchParams.get("active") !== "false";

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("patient_insurance")
    .select("*, insurance_providers(provider_name, provider_code), hospital_patients(full_name, phone)")
    .order("created_at", { ascending: false });

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (patientId) {
    query = query.eq("patient_id", patientId);
  }
  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const enriched = (data || []).map((r) => ({
    ...r,
    provider_name: r.insurance_providers?.provider_name || null,
    provider_code: r.insurance_providers?.provider_code || null,
    patient_name: r.hospital_patients?.full_name || null,
    patient_phone: r.hospital_patients?.phone || null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = patientInsuranceCreateSchema.safeParse(body);
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

  // Validate provider exists and is active
  const { data: provider } = await gate.supabase
    .from("insurance_providers")
    .select("id, provider_name")
    .eq("id", parsed.data.provider_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json({ error: "Insurance provider not found or inactive" }, { status: 400 });
  }

  const tenant = await getTenantContext();
  const row = withHospitalId(
    {
      patient_id: parsed.data.patient_id,
      provider_id: parsed.data.provider_id,
      policy_number: parsed.data.policy_number.trim(),
      group_number: parsed.data.group_number || null,
      insured_name: parsed.data.insured_name.trim(),
      insured_relationship: parsed.data.insured_relationship,
      coverage_from: parsed.data.coverage_from,
      coverage_to: parsed.data.coverage_to,
      coverage_type: parsed.data.coverage_type,
      sum_insured: parsed.data.sum_insured ?? null,
      copay_percent: parsed.data.copay_percent,
      deductible_amount: parsed.data.deductible_amount,
      notes: parsed.data.notes || null,
    },
    tenant.hospitalId
  );

  const { data, error } = await gate.supabase
    .from("patient_insurance")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { error: "A policy with this number already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: { action: "patient_insurance_create", policy_id: data?.id, patient_id: parsed.data.patient_id },
  });

  // Send notification: policy assigned
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
          message: `Your insurance policy (${parsed.data.policy_number}) with ${provider.provider_name} has been registered. Coverage: ${parsed.data.coverage_from} to ${parsed.data.coverage_to}.`,
          hospitalName: "",
        },
      });
    } catch {
      // non-fatal
    }
  }
  if (patient.email) {
    try {
      const notify = getNotificationService();
      await notify.send({
        channel: "email",
        templateId: "generic",
        recipient: patient.email,
        force: true,
        vars: {
          patientName: patient.full_name,
          message: `Your insurance policy (${parsed.data.policy_number}) with ${provider.provider_name} has been registered.`,
          subject: "Insurance Policy Registered",
          hospitalName: "",
        },
      });
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
