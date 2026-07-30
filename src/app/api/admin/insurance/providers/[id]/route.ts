import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  insuranceProviderUpdateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("insurance_providers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = insuranceProviderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.provider_name !== undefined) patch.provider_name = parsed.data.provider_name.trim();
  if (parsed.data.provider_code !== undefined) patch.provider_code = parsed.data.provider_code;
  if (parsed.data.provider_type !== undefined) patch.provider_type = parsed.data.provider_type;
  if (parsed.data.contact_person !== undefined) patch.contact_person = parsed.data.contact_person || null;
  if (parsed.data.contact_email !== undefined) patch.contact_email = parsed.data.contact_email || null;
  if (parsed.data.contact_phone !== undefined) patch.contact_phone = parsed.data.contact_phone || null;
  if (parsed.data.address !== undefined) patch.address = parsed.data.address || null;
  if (parsed.data.registration_number !== undefined) patch.registration_number = parsed.data.registration_number || null;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;
  if (parsed.data.coverage_notes !== undefined) patch.coverage_notes = parsed.data.coverage_notes || null;

  const { data, error } = await gate.supabase
    .from("insurance_providers")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { error: "A provider with this code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: { action: "insurance_provider_update", provider_id: params.id },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  // Check no active policies reference this provider
  const { data: policies } = await gate.supabase
    .from("patient_insurance")
    .select("id")
    .eq("provider_id", params.id)
    .eq("is_active", true)
    .limit(1);

  if (policies && policies.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete provider with active insurance policies. Deactivate instead." },
      { status: 409 }
    );
  }

  const { data, error } = await gate.supabase
    .from("insurance_providers")
    .update({ is_active: false })
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: { action: "insurance_provider_deactivate", provider_id: params.id },
  });

  return NextResponse.json({ ok: true });
}
