import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  insuranceClaimStatusSchema,
  isValidClaimTransition,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";
type ClaimDetail = {
  patient_insurance?: { policy_number?: string; insurance_providers?: { provider_name?: string; id?: string } | null } | null;
  hospital_patients?: { full_name?: string; phone?: string } | null;
  pre_authorizations?: { authorization_number?: string } | null;
};

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("insurance_claims")
    .select(`
      *,
      patient_insurance!inner(
        policy_number,
        insurance_providers(provider_name, provider_code, id)
      ),
      hospital_patients(full_name, phone, email),
      pre_authorizations(authorization_number, treatment_type),
      claim_documents(*),
      claim_status_history(*)
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      ...data,
      policy_number: (data as unknown as ClaimDetail).patient_insurance?.policy_number || null,
      provider_name: (data as unknown as ClaimDetail).patient_insurance?.insurance_providers?.provider_name || null,
      provider_id: (data as unknown as ClaimDetail).patient_insurance?.insurance_providers?.id || null,
      patient_name: (data as unknown as ClaimDetail).hospital_patients?.full_name || null,
      patient_phone: (data as unknown as ClaimDetail).hospital_patients?.phone || null,
      authorization_number: (data as unknown as ClaimDetail).pre_authorizations?.authorization_number || null,
    },
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  if (!body || !body.status) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  const parsed = insuranceClaimStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Get current claim to validate transition
  const { data: current } = await gate.supabase
    .from("insurance_claims")
    .select("status, claim_number, total_bill_amount")
    .eq("id", params.id)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  // Validate status transition
  if (!isValidClaimTransition(current.status, parsed.data.status)) {
    return NextResponse.json(
      {
        error: `Invalid status transition: ${current.status} → ${parsed.data.status}. Allowed: ${isValidClaimTransition.name}`,
      },
      { status: 400 }
    );
  }

  // Additional validation for settlement
  if (parsed.data.status === "settled" && current.status !== "approved" && current.status !== "partially_approved") {
    return NextResponse.json(
      { error: "Claim must be approved before settlement" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    notes: parsed.data.notes || null,
  };

  if (parsed.data.status === "submitted") {
    patch.submitted_date = new Date().toISOString();
    patch.submitted_by = gate.session?.user.id || null;
  }
  if (parsed.data.status === "in_process") {
    patch.processed_date = new Date().toISOString();
  }
  if (parsed.data.approved_amount !== undefined && parsed.data.approved_amount !== null) {
    patch.approved_amount = parsed.data.approved_amount;
  }
  if (parsed.data.settlement_amount !== undefined && parsed.data.settlement_amount !== null) {
    patch.settlement_amount = parsed.data.settlement_amount;
  }
  if (parsed.data.settlement_ref) {
    patch.settlement_ref = parsed.data.settlement_ref;
  }
  if (parsed.data.rejection_reason) {
    patch.rejection_reason = parsed.data.rejection_reason;
  }
  if (parsed.data.status === "settled") {
    patch.settlement_date = new Date().toISOString();
  }

  const { data, error } = await gate.supabase
    .from("insurance_claims")
    .update(patch)
    .eq("id", params.id)
    .select("*, hospital_patients(full_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: {
      action: "insurance_claim_status",
      claim_id: params.id,
      from_status: current.status,
      to_status: parsed.data.status,
    },
  });

  // Notify patient
  const patientData = (data as unknown as ClaimDetail).hospital_patients;
  if (patientData?.phone) {
    try {
      const notify = getNotificationService();
      let message = "";
      if (parsed.data.status === "submitted") message = `Your claim #${current.claim_number} has been submitted for processing.`;
      else if (parsed.data.status === "approved") message = `Your claim #${current.claim_number} has been approved for ₹${parsed.data.approved_amount || "TBD"}.`;
      else if (parsed.data.status === "rejected") message = `Your claim #${current.claim_number} has been rejected. Reason: ${parsed.data.rejection_reason || "N/A"}.`;
      else if (parsed.data.status === "settled") message = `Your claim #${current.claim_number} has been settled for ₹${parsed.data.settlement_amount || "N/A"}. Ref: ${parsed.data.settlement_ref || "N/A"}.`;
      else message = `Your claim #${current.claim_number} status updated to: ${parsed.data.status}.`;

      await notify.send({
        channel: "whatsapp",
        templateId: "generic",
        recipient: patientData.phone,
        force: true,
        vars: { patientName: patientData.full_name, message, hospitalName: "" },
      });
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ data });
}
