import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { getTenantContext } from "@/lib/hospital/tenant";
import { encounterCreateSchema } from "@/lib/clinical/validation";

export const dynamic = "force-dynamic";
const CLINICAL_ROLES = [ROLES.DOCTOR, ROLES.MANAGER];

export async function GET(request: Request) {
  const gate = await requireHmsAdmin(CLINICAL_ROLES);
  if (gate.error || !gate.supabase) return gate.error!;
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const url = new URL(request.url);
  let query = gate.supabase
    .from("clinical_encounters")
    .select("*, hospital_patients(full_name,phone), prescriptions(prescription_number)")
    .eq("hospital_id", tenant.hospitalId)
    .order("created_at", { ascending: false })
    .limit(100);
  const patientId = url.searchParams.get("patient_id");
  if (patientId) query = query.eq("patient_id", patientId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;
  const gate = await requireHmsAdmin([ROLES.DOCTOR]);
  if (gate.error || !gate.supabase || !gate.session) return gate.error!;
  const parsed = encounterCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const { data: patient } = await gate.supabase
    .from("hospital_patients").select("id").eq("id", parsed.data.patient_id)
    .eq("hospital_id", tenant.hospitalId).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found in tenant" }, { status: 404 });
  const { data, error } = await gate.supabase.from("clinical_encounters").insert({
    ...parsed.data,
    hospital_id: tenant.hospitalId,
    clinician_user_id: gate.session.user.id,
    encounter_number: "",
    status: "in_progress",
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await createNotification(gate.supabase,{type:"encounter_started",title:"Clinical encounter started",message:`Encounter ${data.encounter_number} is in progress`,meta:{encounter_id:data.id,patient_id:data.patient_id,hospital_id:tenant.hospitalId}});
  return NextResponse.json({ data }, { status: 201 });
}
