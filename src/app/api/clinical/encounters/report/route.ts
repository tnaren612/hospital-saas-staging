import {NextResponse} from "next/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {requireHmsAdmin} from "@/lib/hms/server";
import {escapeSpreadsheetCell} from "@/lib/hms/export";
export async function GET(request:Request){
 const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const url=new URL(request.url);let q=g.supabase.from("clinical_encounters").select("encounter_number,encounter_type,status,chief_complaint,assessment,plan,diagnoses,created_at,completed_at,hospital_patients(full_name)").eq("hospital_id",t.hospitalId).order("created_at",{ascending:false});const from=url.searchParams.get("from"),to=url.searchParams.get("to");if(from)q=q.gte("created_at",`${from}T00:00:00Z`);if(to)q=q.lte("created_at",`${to}T23:59:59Z`);
 const {data,error}=await q;if(error)return NextResponse.json({error:error.message},{status:400});type R={encounter_number:string;encounter_type:string;status:string;chief_complaint:string;assessment:string;plan:string;diagnoses:{description?:string}[];created_at:string;completed_at:string|null;hospital_patients?:{full_name:string}|null};const rows=[["Encounter","Patient","Type","Status","Complaint","Diagnoses","Assessment","Plan","Started","Completed"],...((data||[]) as unknown as R[]).map(x=>[x.encounter_number,x.hospital_patients?.full_name||"",x.encounter_type,x.status,x.chief_complaint,(x.diagnoses||[]).map(d=>d.description||"").join("; "),x.assessment,x.plan,x.created_at,x.completed_at||""])];const cell=(v:unknown)=>{const s=escapeSpreadsheetCell(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};return new NextResponse(rows.map(r=>r.map(cell).join(",")).join("\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=clinical-encounters.csv"}});
}
