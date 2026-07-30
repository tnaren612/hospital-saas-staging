import {NextResponse} from "next/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {createNotification,requireHmsAdmin,requireSameOriginForMutation} from "@/lib/hms/server";
import {followupCreateSchema} from "@/lib/followup/validation";
const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER];
export async function GET(){
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase)return g.error!;const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const [followups,patients]=await Promise.all([g.supabase.from("patient_followups").select("*,hospital_patients(full_name,phone),followup_events(*)").eq("hospital_id",t.hospitalId).order("follow_up_at"),g.supabase.from("hospital_patients").select("id,full_name,phone").eq("hospital_id",t.hospitalId).order("full_name")]);
 const error=followups.error||patients.error;return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({data:{followups:followups.data||[],patients:patients.data||[]}});
}
export async function POST(r:Request){
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;const g=await requireHmsAdmin(roles);if(g.error||!g.supabase||!g.session)return g.error!;
 const p=followupCreateSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:patient}=await g.supabase.from("hospital_patients").select("id").eq("id",p.data.patient_id).eq("hospital_id",t.hospitalId).maybeSingle();if(!patient)return NextResponse.json({error:"Patient not found"},{status:404});
 const {data,error}=await g.supabase.from("patient_followups").insert({...p.data,discharge_id:p.data.discharge_id||null,clinician_id:p.data.clinician_id||null,recurrence_end:p.data.recurrence_end||null,reminder_at:p.data.reminder_at||null,hospital_id:t.hospitalId,created_by:g.session.user.id,status:"scheduled"}).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:400});await createNotification(g.supabase,{type:"followup_scheduled",title:"Follow-up scheduled",message:`Follow-up scheduled for ${new Date(p.data.follow_up_at).toLocaleString()}`,meta:{followup_id:data.id,patient_id:p.data.patient_id,hospital_id:t.hospitalId}});return NextResponse.json({data},{status:201});
}

