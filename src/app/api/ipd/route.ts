import { NextResponse } from "next/server";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { admissionSchema } from "@/lib/ipd/validation";
const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER];
export async function GET(){
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const [admissions,beds]=await Promise.all([
  g.supabase.from("ipd_admissions").select("*,hospital_patients(full_name,phone),ipd_beds(bed_number,ipd_wards(name))").eq("hospital_id",t.hospitalId).order("admitted_at",{ascending:false}),
  g.supabase.from("ipd_beds").select("*,ipd_wards(name)").eq("hospital_id",t.hospitalId).order("bed_number")
 ]);
 if(admissions.error||beds.error)return NextResponse.json({error:admissions.error?.message||beds.error?.message},{status:400});
 const active=(admissions.data||[]).filter(a=>!["discharged","cancelled"].includes(a.status));
 return NextResponse.json({data:{admissions:admissions.data||[],beds:beds.data||[],census:{active:active.length,available:(beds.data||[]).filter(b=>b.status==="available").length,occupied:(beds.data||[]).filter(b=>b.status==="occupied").length}}});
}
export async function POST(r:Request){
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase||!g.session)return g.error!;
 const p=admissionSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:bed}=await g.supabase.from("ipd_beds").select("id,status").eq("id",p.data.bed_id).eq("hospital_id",t.hospitalId).maybeSingle();
 if(!bed||bed.status!=="available")return NextResponse.json({error:"Bed unavailable"},{status:409});
 const {data,error}=await g.supabase.from("ipd_admissions").insert({...p.data,hospital_id:t.hospitalId,admission_number:"",admitting_doctor_id:g.session.user.id}).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:400});
 await g.supabase.from("ipd_beds").update({status:"occupied"}).eq("id",p.data.bed_id).eq("hospital_id",t.hospitalId);
 await createNotification(g.supabase,{type:"ipd_admission",title:"Patient admitted",message:`Admission ${data.admission_number} created`,meta:{admission_id:data.id,hospital_id:t.hospitalId}});
 return NextResponse.json({data},{status:201});
}
