import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { referralActionSchema } from "@/lib/referral/validation";

const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER];
export async function PATCH(r:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase||!g.session)return g.error!;
 const p=referralActionSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:current}=await g.supabase.from("patient_referrals").select("*").eq("id",params.id).eq("hospital_id",t.hospitalId).maybeSingle();
 if(!current)return NextResponse.json({error:"Referral not found"},{status:404});
 if(p.data.action==="attachment"){
  const {action,...row}=p.data;void action;
  const result=await g.supabase.from("referral_attachments").insert({...row,hospital_id:t.hospitalId,referral_id:current.id,uploaded_by:g.session.user.id}).select("*").single();
  return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({data:result.data},{status:201});
 }
 const {action,...patch}=p.data;void action;
 const result=await g.supabase.from("patient_referrals").update({...patch,appointment_date:patch.appointment_date||current.appointment_date,clinical_notes:patch.notes||current.clinical_notes,updated_at:new Date().toISOString()}).eq("id",current.id).eq("hospital_id",t.hospitalId).select("*").single();
 if(result.error)return NextResponse.json({error:result.error.message},{status:400});
 await createNotification(g.supabase,{type:"referral_status",title:"Referral updated",message:`Referral status: ${patch.status}`,meta:{referral_id:current.id,patient_id:current.patient_id,hospital_id:t.hospitalId}});
 return NextResponse.json({data:result.data});
}

