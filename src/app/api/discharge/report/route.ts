import {NextResponse} from "next/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {requireHmsAdmin} from "@/lib/hms/server";
const roles=[ROLES.DOCTOR,ROLES.BILLING,ROLES.MANAGER];
const cell=(v:unknown)=>{let s=String(v??"");if(/^[=+\-@]/.test(s))s=`'${s}`;return `"${s.replace(/"/g,'""')}"`};
export async function GET(){
 const g=await requireHmsAdmin(roles);if(g.error||!g.supabase)return g.error!;const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data,error}=await g.supabase.from("discharge_cases").select("discharge_number,status,discharge_type,primary_diagnosis,condition_at_discharge,finalized_at,hospital_patients(full_name),ipd_admissions(admission_number)").eq("hospital_id",t.hospitalId).order("created_at",{ascending:false});
 if(error)return NextResponse.json({error:error.message},{status:400});
 type R={discharge_number:string;status:string;discharge_type:string;primary_diagnosis:string;condition_at_discharge:string;finalized_at:string|null;hospital_patients?:{full_name:string}|null;ipd_admissions?:{admission_number:string}|null};
 const rows=(data as unknown as R[]||[]).map(r=>[r.discharge_number,r.ipd_admissions?.admission_number,r.hospital_patients?.full_name,r.discharge_type,r.status,r.primary_diagnosis,r.condition_at_discharge,r.finalized_at]);
 const csv=[["Discharge","Admission","Patient","Type","Status","Diagnosis","Condition","Finalized"],...rows].map(r=>r.map(cell).join(",")).join("\r\n");
 return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="discharge-report.csv"'}});
}
