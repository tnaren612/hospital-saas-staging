import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { bedSchema, wardSchema } from "@/lib/ipd/validation";

const roles=[ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER];
export async function GET(){
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data,error}=await g.supabase.from("ipd_wards").select("*,ipd_beds(*)").eq("hospital_id",t.hospitalId).order("name");
 return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({data:data||[]});
}
export async function POST(r:Request){
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin([ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const body=await r.json().catch(()=>null);
 if(body?.action==="bed"){
  const p=bedSchema.safeParse(body);if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
  const {data,error}=await g.supabase.from("ipd_beds").insert({...p.data,hospital_id:t.hospitalId,status:"available"}).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:409});
  await createNotification(g.supabase,{type:"ipd_bed_created",title:"Bed created",message:`Bed ${data.bed_number} is available`,meta:{hospital_id:t.hospitalId,bed_id:data.id}});
  return NextResponse.json({data},{status:201});
 }
 const p=wardSchema.safeParse(body);if(!p.success)return NextResponse.json({error:"Validation failed",details:p.error.flatten()},{status:400});
 const {data,error}=await g.supabase.from("ipd_wards").insert({...p.data,hospital_id:t.hospitalId,status:"active"}).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:409});
 await createNotification(g.supabase,{type:"ipd_ward_created",title:"Ward created",message:`Ward ${data.name} created`,meta:{hospital_id:t.hospitalId,ward_id:data.id}});
 return NextResponse.json({data},{status:201});
}
export async function PATCH(r:Request){
 const csrf=requireSameOriginForMutation(r);if(csrf)return csrf;
 const g=await requireHmsAdmin([ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const body=await r.json().catch(()=>null),id=String(body?.id||""),kind=body?.kind==="ward"?"ward":"bed",status=String(body?.status||"");
 if(!id||!(kind==="ward"?["active","inactive"]:["available","cleaning","maintenance","inactive"]).includes(status))return NextResponse.json({error:"Invalid status update"},{status:400});
 const query=kind==="ward"?g.supabase.from("ipd_wards"):g.supabase.from("ipd_beds");
 const {data,error}=await query.update({status}).eq("id",id).eq("hospital_id",t.hospitalId).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:400});
 await createNotification(g.supabase,{type:`ipd_${kind}_status`,title:`IPD ${kind} status updated`,message:`${kind} status changed to ${status}`,meta:{hospital_id:t.hospitalId}});
 return NextResponse.json({data});
}
