import {NextResponse} from "next/server";
import {ROLES} from "@/lib/auth/roles";
import {getTenantContext} from "@/lib/hospital/tenant";
import {requireHmsAdmin} from "@/lib/hms/server";
import {escapeSpreadsheetCell} from "@/lib/hms/export";
export async function GET(){
 const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data,error}=await g.supabase.from("patient_followups").select("follow_up_at,department,purpose,recurrence,status,reminder_status,outcome,hospital_patients(full_name)").eq("hospital_id",t.hospitalId).order("follow_up_at");if(error)return NextResponse.json({error:error.message},{status:400});
 type R={follow_up_at:string;department:string;purpose:string;recurrence:string;status:string;reminder_status:string;outcome:string;hospital_patients?:{full_name:string}|null};const rows=[["Date","Patient","Department","Purpose","Recurrence","Status","Reminder","Outcome"],...((data||[]) as unknown as R[]).map(x=>[x.follow_up_at,x.hospital_patients?.full_name||"",x.department,x.purpose,x.recurrence,x.status,x.reminder_status,x.outcome])];const cell=(v:unknown)=>{const s=escapeSpreadsheetCell(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};return new NextResponse(rows.map(r=>r.map(cell).join(",")).join("\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=followups.csv"}});
}

