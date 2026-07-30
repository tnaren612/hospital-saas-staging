import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  insuranceProviderCreateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const activeOnly = searchParams.get("active") !== "false";

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("insurance_providers")
    .select("*")
    .order("provider_name");

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = data || [];
  if (q) {
    rows = rows.filter(
      (p) =>
        String(p.provider_name).toLowerCase().includes(q) ||
        String(p.provider_code).toLowerCase().includes(q) ||
        String(p.contact_person || "").toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = insuranceProviderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await getTenantContext();
  const row = withHospitalId(
    {
      provider_name: parsed.data.provider_name.trim(),
      provider_code: parsed.data.provider_code,
      provider_type: parsed.data.provider_type,
      contact_person: parsed.data.contact_person || null,
      contact_email: parsed.data.contact_email || null,
      contact_phone: parsed.data.contact_phone || null,
      address: parsed.data.address || null,
      registration_number: parsed.data.registration_number || null,
      is_active: parsed.data.is_active ?? true,
      coverage_notes: parsed.data.coverage_notes || null,
    },
    tenant.hospitalId
  );

  const { data, error } = await gate.supabase
    .from("insurance_providers")
    .insert(row)
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

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: gate.session?.profile.role || undefined,
    success: true,
    metadata: { action: "insurance_provider_create", provider_id: data?.id },
  });

  return NextResponse.json({ data }, { status: 201 });
}
