import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { getTenantContext } from "@/lib/hospital/tenant";
import { encounterPatchSchema } from "@/lib/clinical/validation";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;
  const gate = await requireHmsAdmin([ROLES.DOCTOR]);
  if (gate.error || !gate.supabase || !gate.session) return gate.error!;
  const parsed = encounterPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const patch = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
    ...(parsed.data.status === "completed"
      ? { completed_at: new Date().toISOString(), completed_by: gate.session.user.id }
      : {}),
  };
  const { data, error } = await gate.supabase.from("clinical_encounters")
    .update(patch).eq("id", params.id).eq("hospital_id", tenant.hospitalId)
    .select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
  await createNotification(gate.supabase,{type:parsed.data.status==="completed"?"encounter_completed":"encounter_updated",title:parsed.data.status==="completed"?"Clinical encounter completed":"Clinical encounter updated",message:`Encounter ${data.encounter_number} ${data.status}`,meta:{encounter_id:data.id,patient_id:data.patient_id,hospital_id:tenant.hospitalId}});
  return NextResponse.json({ data });
}
