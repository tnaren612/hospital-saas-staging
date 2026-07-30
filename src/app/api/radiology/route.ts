import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { radiologyOrderSchema } from "@/lib/radiology/validation";

const roles = [ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER, ROLES.RADIOLOGY_TECHNICIAN];

export async function GET() {
  const g = await requireHmsAdmin(roles);
  if (g.error || !g.supabase) return g.error!;
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const { data, error } = await g.supabase
    .from("radiology_studies")
    .select("*,hospital_patients(full_name,phone),radiology_attachments(*)")
    .eq("hospital_id", tenant.hospitalId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const studies = data || [];
  return NextResponse.json({
    data: {
      studies,
      summary: {
        ordered: studies.filter((study) => study.status === "ordered").length,
        scheduled: studies.filter((study) => study.status === "scheduled").length,
        active: studies.filter((study) => ["checked_in", "in_progress", "completed"].includes(study.status)).length,
        reported: studies.filter((study) => study.status === "reported").length,
      },
    },
  });
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;
  const g = await requireHmsAdmin(roles);
  if (g.error || !g.supabase || !g.session) return g.error!;
  const parsed = radiologyOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const { data: patient } = await g.supabase
    .from("hospital_patients").select("id").eq("id", parsed.data.patient_id)
    .eq("hospital_id", tenant.hospitalId).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  const { data, error } = await g.supabase.from("radiology_studies").insert({
    ...parsed.data,
    hospital_id: tenant.hospitalId,
    study_number: "",
    ordered_by: g.session.user.id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await createNotification(g.supabase, {
    type: "radiology_order",
    title: "Radiology study ordered",
    message: `${data.study_number} requires scheduling`,
    meta: { study_id: data.id, hospital_id: tenant.hospitalId },
  });
  return NextResponse.json({ data }, { status: 201 });
}
