import {NextResponse} from "next/server";
import {createNotification,requireHmsAdmin,requireSameOriginForMutation} from "@/lib/hms/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {ipdActionSchema} from "@/lib/ipd/validation";
export async function PATCH(r:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;
 const p=ipdActionSchema.safeParse(await r.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data:current}=await g.supabase.from("ipd_admissions").select("*").eq("id",params.id).eq("hospital_id",t.hospitalId).maybeSingle();
 if(!current)return NextResponse.json({error:"Admission not found"},{status:404});
 let patch:Record<string,unknown>={};
 if(p.data.action==="transfer"){const {data:bed}=await g.supabase.from("ipd_beds").select("status").eq("id",p.data.bed_id).eq("hospital_id",t.hospitalId).maybeSingle();if(!bed||bed.status!=="available")return NextResponse.json({error:"Bed unavailable"},{status:409});await g.supabase.from("ipd_beds").update({status:"available"}).eq("id",current.bed_id);await g.supabase.from("ipd_beds").update({status:"occupied"}).eq("id",p.data.bed_id);patch={bed_id:p.data.bed_id,status:"transferred"}}
 if(p.data.action==="plan_discharge")patch={status:"discharge_planned",expected_discharge_date:p.data.expected_discharge_date};
 if(p.data.action==="update_notes")patch={care_notes:p.data.care_notes};
 if(p.data.action==="discharge"){patch={status:"discharged",discharged_at:new Date().toISOString(),discharge_summary:p.data.discharge_summary,discharge_instructions:p.data.discharge_instructions,follow_up_date:p.data.follow_up_date||null};await g.supabase.from("ipd_beds").update({status:"cleaning"}).eq("id",current.bed_id)}
 const {data,error}=await g.supabase.from("ipd_admissions").update(patch).eq("id",params.id).eq("hospital_id",t.hospitalId).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:400});
 if(["transfer","plan_discharge","discharge"].includes(p.data.action))await createNotification(g.supabase,{type:`ipd_${p.data.action}`,title:`IPD ${p.data.action.replace("_"," ")}`,message:`Admission ${data.admission_number} updated`,meta:{admission_id:data.id,hospital_id:t.hospitalId}});
 return NextResponse.json({data});
}
