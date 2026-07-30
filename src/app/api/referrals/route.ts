import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { referralCreateSchema } from "@/lib/referral/validation";

const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER];
export async function GET(){
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const [referrals,patients,departments]=await Promise.all([
  g.supabase.from("patient_referrals").select("*,hospital_patients(full_name,phone),departments:referred_department_id(name),referral_attachments(*),referral_events(*)").eq("hospital_id",t.hospitalId).order("created_at",{ascending:false}),
  g.supabase.from("hospital_patients").select("id,full_name,phone").eq("hospital_id",t.hospitalId).order("full_name"),
  g.supabase.from("departments").select("id,name").eq("hospital_id",t.hospitalId).eq("status","active").order("name")
 ]);
 const error=referrals.error||patients.error||departments.error;
 return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({data:{referrals:referrals.data||[],patients:patients.data||[],departments:departments.data||[]}});
}
export async function POST(r:Request){
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase||!g.session)return g.error!;
 const p=referralCreateSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:patient}=await g.supabase.from("hospital_patients").select("id").eq("id",p.data.patient_id).eq("hospital_id",t.hospitalId).maybeSingle();
 if(!patient)return NextResponse.json({error:"Patient not found"},{status:404});
 const {data,error}=await g.supabase.from("patient_referrals").insert({...p.data,appointment_date:p.data.appointment_date||null,referred_department_id:p.data.referred_department_id||null,referred_clinician_id:p.data.referred_clinician_id||null,discharge_id:p.data.discharge_id||null,hospital_id:t.hospitalId,created_by:g.session.user.id,status:"draft"}).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:400});
 await createNotification(g.supabase,{type:"referral_created",title:"Referral created",message:`Referral for ${p.data.referred_to}`,meta:{referral_id:data.id,patient_id:p.data.patient_id,hospital_id:t.hospitalId}});
 return NextResponse.json({data},{status:201});
}

