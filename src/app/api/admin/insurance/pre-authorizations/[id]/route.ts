import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  preAuthorizationApproveSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { writeAuthEvent } from "@/lib/auth/audit";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";
type PreauthorizationDetail = {
  patient_insurance?: { policy_number?: string; insurance_providers?: { provider_name?: string } | null } | null;
  hospital_patients?: { full_name?: string; phone?: string } | null;
};

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("pre_authorizations")
    .select(`
      *,
      patient_insurance!inner(
        policy_number,
        insurance_providers(provider_name)
      ),
      hospital_patients(full_name, phone, email)
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      ...data,
      policy_number: (data as unknown as PreauthorizationDetail).patient_insurance?.policy_number || null,
      provider_name: (data as unknown as PreauthorizationDetail).patient_insurance?.insurance_providers?.provider_name || null,
      patient_name: (data as unknown as PreauthorizationDetail).hospital_patients?.full_name || null,
      patient_phone: (data as unknown as PreauthorizationDetail).hospital_patients?.phone || null,
    },
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);

  // Approval/rejection flow
  if (body && body.status && ["approved", "partially_approved", "rejected"].includes(body.status)) {
    const parsed = preAuthorizationApproveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {
      status: parsed.data.status,
      approved_by: gate.session?.user.id || null,
      approved_at: new Date().toISOString(),
      rejection_reason: parsed.data.rejection_reason || null,
      clinical_notes: parsed.data.clinical_notes || null,
    };

    if (parsed.data.approved_amount !== undefined && parsed.data.approved_amount !== null) {
      patch.approved_amount = parsed.data.approved_amount;
    }

    const { data, error } = await gate.supabase
      .from("pre_authorizations")
      .update(patch)
      .eq("id", params.id)
      .select("*, hospital_patients(full_name, phone)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await writeAuthEvent({
      event_type: "admin_action",
      user_id: gate.session?.user.id,
      role: gate.session?.profile.role || undefined,
      success: true,
      metadata: {
        action: "preauthorization_review",
        preauth_id: params.id,
        status: parsed.data.status,
      },
    });

    // Send notification
    const patientData = (data as unknown as PreauthorizationDetail).hospital_patients;
    if (patientData?.phone) {
      const isApproved = parsed.data.status === "approved" || parsed.data.status === "partially_approved";
      try {
        const notify = getNotificationService();
        await notify.send({
          channel: "whatsapp",
          templateId: "generic",
          recipient: patientData.phone,
          force: true,
          vars: {
            patientName: patientData.full_name,
            message: isApproved
              ? `Your pre-authorization has been ${parsed.data.status}. Approved amount: ₹${parsed.data.approved_amount || "TBD"}.`
              : `Your pre-authorization has been ${parsed.data.status}. Reason: ${parsed.data.rejection_reason || "N/A"}.`,
            hospitalName: "",
          },
        });
      } catch {
        // non-fatal
      }
    }

    return NextResponse.json({ data });
  }

  // Submission flow (draft → submitted)
  if (body && body.status === "submitted") {
    const { data, error } = await gate.supabase
      .from("pre_authorizations")
      .update({
        status: "submitted",
        requested_by: gate.session?.user.id || null,
      })
      .eq("id", params.id)
      .eq("status", "draft")
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found or already submitted" }, { status: 404 });

    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
}
