import {NextResponse} from "next/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {createNotification,requireHmsAdmin,requireSameOriginForMutation} from "@/lib/hms/server";
import {followupActionSchema} from "@/lib/followup/validation";
export async function PATCH(r:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;
 const p=followupActionSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:current}=await g.supabase.from("patient_followups").select("*").eq("id",params.id).eq("hospital_id",t.hospitalId).maybeSingle();if(!current)return NextResponse.json({error:"Follow-up not found"},{status:404});
 if(p.data.action==="remind"){await createNotification(g.supabase,{type:"followup_reminder",title:"Follow-up reminder",message:`Follow-up: ${current.purpose}`,meta:{followup_id:current.id,patient_id:current.patient_id,hospital_id:t.hospitalId}});const result=await g.supabase.from("patient_followups").update({reminder_status:"sent",updated_at:new Date().toISOString()}).eq("id",current.id).eq("hospital_id",t.hospitalId).select("*").single();return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data})}
 const patch=p.data.action==="complete"?{status:"completed",visit_notes:p.data.visit_notes,clinical_review:p.data.clinical_review,outcome:p.data.outcome,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{status:p.data.status,instructions:p.data.notes||current.instructions,updated_at:new Date().toISOString()};
 const result=await g.supabase.from("patient_followups").update(patch).eq("id",current.id).eq("hospital_id",t.hospitalId).select("*").single();return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data});
}

