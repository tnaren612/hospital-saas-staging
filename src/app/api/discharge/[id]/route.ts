import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { dischargeActionSchema } from "@/lib/discharge/validation";

const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.BILLING,ROLES.FINANCE,ROLES.PHARMACIST,ROLES.RADIOLOGY_TECHNICIAN,ROLES.MANAGER];
export async function PATCH(r:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase||!g.session)return g.error!;
 const p=dischargeActionSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:d}=await g.supabase.from("discharge_cases").select("*").eq("id",params.id).eq("hospital_id",t.hospitalId).maybeSingle();
 if(!d)return NextResponse.json({error:"Discharge case not found"},{status:404});
 if(["discharged","cancelled"].includes(d.status))return NextResponse.json({error:"Discharge case is closed"},{status:409});
 if(p.data.action==="update_summary"){
  const {action,...patch}=p.data;void action;
  const result=await g.supabase.from("discharge_cases").update(patch).eq("id",d.id).eq("hospital_id",t.hospitalId).select("*").single();
  return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data});
 }
 if(p.data.action==="clearance"){
  const permissions:Record<string,string[]>={
   clinical:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.DOCTOR,ROLES.MANAGER],
   nursing:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.DOCTOR,ROLES.MANAGER],
   radiology:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.DOCTOR,ROLES.RADIOLOGY_TECHNICIAN,ROLES.MANAGER],
   pharmacy:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.PHARMACIST,ROLES.MANAGER],
   billing:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.BILLING,ROLES.FINANCE,ROLES.MANAGER],
   insurance:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.BILLING,ROLES.FINANCE,ROLES.MANAGER],
   inventory:[ROLES.SUPER_ADMIN,ROLES.ADMIN,ROLES.PHARMACIST,ROLES.MANAGER]
  };
  if(!permissions[p.data.clearance_type].includes(g.session.profile.role))return NextResponse.json({error:"Role cannot approve this clearance"},{status:403});
  const {data,error}=await g.supabase.from("discharge_clearances").update({status:p.data.status,notes:p.data.notes,checked_by:g.session.user.id,checked_at:new Date().toISOString()}).eq("discharge_id",d.id).eq("hospital_id",t.hospitalId).eq("clearance_type",p.data.clearance_type).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:400});await updateReady(g.supabase,d.id,t.hospitalId);return NextResponse.json({data});
 }
 if(p.data.action==="refresh_clearances"){
  const [encounter,radiology,bills,claims,prescriptions]=await Promise.all([
   d.encounter_id?g.supabase.from("clinical_encounters").select("status").eq("id",d.encounter_id).eq("hospital_id",t.hospitalId).maybeSingle():Promise.resolve({data:null,error:null}),
   g.supabase.from("radiology_studies").select("id,status").eq("patient_id",d.patient_id).eq("hospital_id",t.hospitalId).not("status","in","(reported,cancelled)"),
   g.supabase.from("hospital_bills").select("id,payment_status").eq("patient_id",d.patient_id).eq("hospital_id",t.hospitalId).in("payment_status",["pending","partial"]),
   g.supabase.from("insurance_claims").select("id,status").eq("patient_id",d.patient_id).eq("hospital_id",t.hospitalId).in("status",["draft","submitted","in_process"]),
   g.supabase.from("prescriptions").select("id,status").eq("patient_id",d.patient_id).eq("hospital_id",t.hospitalId).in("status",["draft","active"])
  ]);
  const states:Record<string,{status:"approved"|"blocked";notes:string}>={
   clinical:{status:!d.encounter_id||encounter.data?.status==="completed"?"approved":"blocked",notes:!d.encounter_id||encounter.data?.status==="completed"?"Clinical documentation complete":"Encounter must be completed"},
   nursing:{status:"blocked",notes:"Nursing discharge checklist requires manual approval"},
   radiology:{status:(radiology.data||[]).length===0?"approved":"blocked",notes:(radiology.data||[]).length===0?"Radiology reports complete":"Pending radiology studies"},
   billing:{status:(bills.data||[]).length===0?"approved":"blocked",notes:(bills.data||[]).length===0?"No outstanding hospital bills":"Outstanding bill balance"},
   insurance:{status:(claims.data||[]).length===0?"approved":"blocked",notes:(claims.data||[]).length===0?"No pending insurance processing":"Insurance claim pending"},
   pharmacy:{status:(prescriptions.data||[]).length===0?"approved":"blocked",notes:(prescriptions.data||[]).length===0?"Medication reconciliation complete":"Prescription dispensing pending"}
  };
  await Promise.all(Object.entries(states).map(([type,state])=>g.supabase.from("discharge_clearances").update({...state,checked_by:g.session!.user.id,checked_at:new Date().toISOString()}).eq("discharge_id",d.id).eq("hospital_id",t.hospitalId).eq("clearance_type",type)));
  await updateReady(g.supabase,d.id,t.hospitalId);return NextResponse.json({data:states});
 }
 if(p.data.action==="referral"){
  const {action,...row}=p.data;void action;const result=await g.supabase.from("patient_referrals").insert({...row,appointment_date:row.appointment_date||null,hospital_id:t.hospitalId,discharge_id:d.id,patient_id:d.patient_id,created_by:g.session.user.id}).select("*").single();
  return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data},{status:201});
 }
 if(p.data.action==="follow_up"){
  const {action,...row}=p.data;void action;const result=await g.supabase.from("patient_followups").insert({...row,clinician_id:row.clinician_id||null,hospital_id:t.hospitalId,discharge_id:d.id,patient_id:d.patient_id,created_by:g.session.user.id}).select("*").single();
  return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data},{status:201});
 }
 if(p.data.action==="medication"){
  const {action,...row}=p.data;void action;const result=await g.supabase.from("discharge_medications").insert({...row,prescription_id:row.prescription_id||null,hospital_id:t.hospitalId,discharge_id:d.id}).select("*").single();
  return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data},{status:201});
 }
 if(p.data.action==="cancel"){
  const {data,error}=await g.supabase.from("discharge_cases").update({status:"cancelled",emergency_instructions:p.data.reason}).eq("id",d.id).eq("hospital_id",t.hospitalId).select("*").single();
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({data});
 }
 const {data,error}=await g.supabase.rpc("finalize_enterprise_discharge",{p_discharge_id:d.id});
 if(error)return NextResponse.json({error:error.message},{status:409});
 await createNotification(g.supabase,{type:"discharge_completed",title:"Patient discharged",message:`${d.discharge_number} completed`,meta:{discharge_id:d.id,patient_id:d.patient_id,hospital_id:t.hospitalId}});
 return NextResponse.json({data});
}
async function updateReady(supabase:NonNullable<Awaited<ReturnType<typeof requireHmsAdmin>>["supabase"]>,id:string,hospitalId:string){
 const {data}=await supabase.from("discharge_clearances").select("status").eq("discharge_id",id).eq("hospital_id",hospitalId);
 const ready=(data||[]).length===7&&(data||[]).every((row)=>["approved","waived"].includes(row.status));
 await supabase.from("discharge_cases").update({status:ready?"ready":"clearance_pending"}).eq("id",id).eq("hospital_id",hospitalId);
}
