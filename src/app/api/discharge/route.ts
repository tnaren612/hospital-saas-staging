import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { dischargeCreateSchema } from "@/lib/discharge/validation";

const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.BILLING,ROLES.FINANCE,ROLES.PHARMACIST,ROLES.RADIOLOGY_TECHNICIAN,ROLES.MANAGER];
export async function GET(){
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const [cases,admissions]=await Promise.all([
  g.supabase.from("discharge_cases").select("*,hospital_patients(full_name,phone),ipd_admissions(admission_number,status),discharge_clearances(*),patient_referrals(*),patient_followups(*),discharge_medications(*)").eq("hospital_id",t.hospitalId).order("created_at",{ascending:false}),
  g.supabase.from("ipd_admissions").select("id,admission_number,status,patient_id,encounter_id,provisional_diagnosis,hospital_patients(full_name,phone)").eq("hospital_id",t.hospitalId).in("status",["admitted","transferred","discharge_planned"]).order("admitted_at",{ascending:false})
 ]);
 if(cases.error||admissions.error)return NextResponse.json({error:cases.error?.message||admissions.error?.message},{status:400});
 return NextResponse.json({data:{cases:cases.data||[],admissions:admissions.data||[]}});
}
export async function POST(r:Request){
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.MANAGER]);if(g.error||!g.supabase||!g.session)return g.error!;
 const p=dischargeCreateSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:admission}=await g.supabase.from("ipd_admissions").select("id,patient_id,encounter_id,status").eq("id",p.data.admission_id).eq("hospital_id",t.hospitalId).maybeSingle();
 if(!admission||["discharged","cancelled"].includes(admission.status))return NextResponse.json({error:"Active admission not found"},{status:404});
 const {data,error}=await g.supabase.from("discharge_cases").insert({hospital_id:t.hospitalId,discharge_number:"",admission_id:admission.id,patient_id:admission.patient_id,encounter_id:p.data.encounter_id||admission.encounter_id||null,discharge_type:p.data.discharge_type,primary_diagnosis:p.data.primary_diagnosis,prepared_by:g.session.user.id,status:"clearance_pending"}).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:/unique/i.test(error.message)?409:400});
 await createNotification(g.supabase,{type:"discharge_started",title:"Discharge initiated",message:`${data.discharge_number} requires clearances`,meta:{discharge_id:data.id,hospital_id:t.hospitalId}});
 return NextResponse.json({data},{status:201});
}
