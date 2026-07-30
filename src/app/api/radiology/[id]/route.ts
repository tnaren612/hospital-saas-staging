import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { radiologyActionSchema } from "@/lib/radiology/validation";

const roles = [ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER, ROLES.RADIOLOGY_TECHNICIAN];

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;
  const g = await requireHmsAdmin(roles);
  if (g.error || !g.supabase || !g.session) return g.error!;
  const parsed = radiologyActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const { data: current } = await g.supabase.from("radiology_studies").select("*")
    .eq("id", params.id).eq("hospital_id", tenant.hospitalId).maybeSingle();
  if (!current) return NextResponse.json({ error: "Study not found" }, { status: 404 });
  if(parsed.data.action==="attachment"){
    const {action,...row}=parsed.data;void action;
    const result=await g.supabase.from("radiology_attachments").insert({...row,hospital_id:tenant.hospitalId,study_id:current.id,uploaded_by:g.session.user.id}).select("*").single();
    if(result.error)return NextResponse.json({error:result.error.message},{status:400});
    await g.supabase.from("radiology_events").insert({hospital_id:tenant.hospitalId,study_id:current.id,actor_id:g.session.user.id,event_type:"attachment_added",details:{attachment_id:result.data.id,file_name:row.file_name}});
    return NextResponse.json({data:result.data},{status:201});
  }
  if(parsed.data.action==="remove_attachment"){
    const result=await g.supabase.from("radiology_attachments").delete().eq("id",parsed.data.attachment_id).eq("study_id",current.id).eq("hospital_id",tenant.hospitalId);
    if(result.error)return NextResponse.json({error:result.error.message},{status:400});
    await g.supabase.from("radiology_events").insert({hospital_id:tenant.hospitalId,study_id:current.id,actor_id:g.session.user.id,event_type:"attachment_removed",details:{attachment_id:parsed.data.attachment_id}});
    return NextResponse.json({data:{deleted:true}});
  }

  let patch: Record<string, unknown>;
  if (parsed.data.action === "schedule") {
    if (!["ordered", "scheduled"].includes(current.status)) {
      return NextResponse.json({ error: "Only ordered studies can be scheduled" }, { status: 409 });
    }
    patch = { status: "scheduled", scheduled_at: parsed.data.scheduled_at };
  } else if (parsed.data.action === "set_status") {
    const allowed: Record<string, string[]> = {
      scheduled: ["checked_in"], checked_in: ["in_progress"], in_progress: ["completed"],
    };
    if (!allowed[current.status]?.includes(parsed.data.status)) {
      return NextResponse.json({ error: "Invalid status transition" }, { status: 409 });
    }
    patch = { status: parsed.data.status };
    if (parsed.data.status === "in_progress") patch.technician_id = g.session.user.id;
  } else if (parsed.data.action === "report") {
    if (current.status !== "completed") {
      return NextResponse.json({ error: "Study must be completed before reporting" }, { status: 409 });
    }
    patch = {
      status: "reported",
      findings: parsed.data.findings,
      impression: parsed.data.impression,
      recommendations: parsed.data.recommendations,
      report_url: parsed.data.report_url || null,
      radiologist_id: g.session.user.id,
      reported_at: new Date().toISOString(),
    };
  } else {
    if (["reported", "cancelled"].includes(current.status)) {
      return NextResponse.json({ error: "Study cannot be cancelled" }, { status: 409 });
    }
    patch = { status: "cancelled", cancellation_reason: parsed.data.cancellation_reason };
  }
  const { data, error } = await g.supabase.from("radiology_studies").update(patch)
    .eq("id", params.id).eq("hospital_id", tenant.hospitalId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (["schedule", "report", "cancel"].includes(parsed.data.action)) {
    await createNotification(g.supabase, {
      type: `radiology_${parsed.data.action}`,
      title: `Radiology ${parsed.data.action}`,
      message: `${data.study_number} updated`,
      meta: { study_id: data.id, hospital_id: tenant.hospitalId },
    });
  }
  return NextResponse.json({ data });
}
