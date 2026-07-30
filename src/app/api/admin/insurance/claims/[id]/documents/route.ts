import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  claimDocumentCreateSchema,
  INSURANCE_WRITE_ROLES,
} from "@/lib/insurance/validation";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("claim_documents")
    .select("*")
    .eq("claim_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin(INSURANCE_WRITE_ROLES as unknown as string[]);
  if (gate.error || !gate.supabase) return gate.error!;

  // Verify claim exists
  const { data: claim } = await gate.supabase
    .from("insurance_claims")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = claimDocumentCreateSchema.safeParse({ ...body, claim_id: params.id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await getTenantContext();
  const row = withHospitalId(
    {
      claim_id: params.id,
      document_type: parsed.data.document_type,
      file_name: parsed.data.file_name,
      file_url: parsed.data.file_url,
      file_size: parsed.data.file_size ?? null,
      uploaded_by: gate.session?.user.id || null,
      notes: parsed.data.notes || null,
    },
    tenant.hospitalId
  );

  const { data, error } = await gate.supabase
    .from("claim_documents")
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
      action: "claim_document_upload",
      claim_id: params.id,
      document_id: data?.id,
    },
  });

  return NextResponse.json({ data }, { status: 201 });
}
