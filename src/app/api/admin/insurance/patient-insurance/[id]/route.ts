import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  patientInsuranceVerifySchema,
  patientInsuranceUpdateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";
type PolicyDetail = {
  insurance_providers?: { provider_name?: string; provider_code?: string } | null;
  hospital_patients?: { full_name?: string; phone?: string } | null;
};

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("patient_insurance")
    .select("*, insurance_providers(provider_name, provider_code), hospital_patients(full_name, phone, email)")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      ...data,
      provider_name: (data as unknown as PolicyDetail).insurance_providers?.provider_name || null,
      provider_code: (data as unknown as PolicyDetail).insurance_providers?.provider_code || null,
      patient_name: (data as unknown as PolicyDetail).hospital_patients?.full_name || null,
      patient_phone: (data as unknown as PolicyDetail).hospital_patients?.phone || null,
    },
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);

  // If verification status update, use verify schema
  if (body && body.verification_status) {
    const parsed = patientInsuranceVerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {
      verification_status: parsed.data.verification_status,
      notes: parsed.data.notes || null,
    };
    if (parsed.data.verification_status === "verified") {
      patch.verified_at = new Date().toISOString();
      patch.verified_by = gate.session?.user.id || null;
    }

    const { data, error } = await gate.supabase
      .from("patient_insurance")
      .update(patch)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await writeAuthEvent({
      event_type: "admin_action",
      user_id: gate.session?.user.id,
      role: gate.session?.profile.role || undefined,
      success: true,
      metadata: { action: "patient_insurance_verify", policy_id: params.id, status: parsed.data.verification_status },
    });

    return NextResponse.json({ data });
  }

  // Otherwise, partial update
  const parsed = patientInsuranceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.provider_id !== undefined) patch.provider_id = parsed.data.provider_id;
  if (parsed.data.policy_number !== undefined) patch.policy_number = parsed.data.policy_number;
  if (parsed.data.group_number !== undefined) patch.group_number = parsed.data.group_number || null;
  if (parsed.data.insured_name !== undefined) patch.insured_name = parsed.data.insured_name;
  if (parsed.data.insured_relationship !== undefined) patch.insured_relationship = parsed.data.insured_relationship;
  if (parsed.data.coverage_from !== undefined) patch.coverage_from = parsed.data.coverage_from;
  if (parsed.data.coverage_to !== undefined) patch.coverage_to = parsed.data.coverage_to;
  if (parsed.data.coverage_type !== undefined) patch.coverage_type = parsed.data.coverage_type;
  if (parsed.data.sum_insured !== undefined) patch.sum_insured = parsed.data.sum_insured ?? null;
  if (parsed.data.copay_percent !== undefined) patch.copay_percent = parsed.data.copay_percent;
  if (parsed.data.deductible_amount !== undefined) patch.deductible_amount = parsed.data.deductible_amount;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes || null;

  const { data, error } = await gate.supabase
    .from("patient_insurance")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: { action: "patient_insurance_update", policy_id: params.id },
  });

  return NextResponse.json({ data });
}
