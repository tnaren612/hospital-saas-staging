import {NextResponse} from "next/server";
import {requireHmsAdmin} from "@/lib/hms/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {escapeSpreadsheetCell} from "@/lib/hms/export";
export async function GET(){
 const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data,error}=await g.supabase.from("ipd_admissions").select("admission_number,status,admission_type,reason,admitted_at,discharged_at,hospital_patients(full_name),ipd_beds(bed_number)").eq("hospital_id",t.hospitalId).order("admitted_at",{ascending:false});
 if(error)return NextResponse.json({error:error.message},{status:400});
 const headers=["Admission","Patient","Bed","Type","Status","Reason","Admitted","Discharged"];
 type ReportRow={admission_number:string;admission_type:string;status:string;reason:string;admitted_at:string;discharged_at:string|null;hospital_patients?:{full_name:string}|null;ipd_beds?:{bed_number:string}|null};
 const rows=((data||[]) as unknown as ReportRow[]).map((r)=>[r.admission_number,r.hospital_patients?.full_name||"",r.ipd_beds?.bed_number||"",r.admission_type,r.status,r.reason,r.admitted_at,r.discharged_at||""]);
 const cell=(value:unknown)=>{const s=escapeSpreadsheetCell(value);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
 const csv=[headers,...rows].map(row=>row.map(cell).join(",")).join("\r\n");
 return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="ipd-census.csv"`}});
}
