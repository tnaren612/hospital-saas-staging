import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { requireHmsAdmin } from "@/lib/hms/server";
import { escapeSpreadsheetCell } from "@/lib/hms/export";

export async function GET(){
 const g=await requireHmsAdmin([ROLES.DOCTOR,ROLES.RECEPTIONIST,ROLES.MANAGER]);if(g.error||!g.supabase)return g.error!;
 const t=await getTenantContext();if(!t.hospitalId)return NextResponse.json({error:"Tenant required"},{status:409});
 const {data,error}=await g.supabase.from("patient_referrals").select("created_at,referral_type,referred_to,specialty,facility_name,reason,urgency,status,appointment_date,hospital_patients(full_name)").eq("hospital_id",t.hospitalId).order("created_at",{ascending:false});
 if(error)return NextResponse.json({error:error.message},{status:400});
 type ReportRow={created_at:string;referral_type:string;referred_to:string;specialty:string;facility_name:string;reason:string;urgency:string;status:string;appointment_date:string|null;hospital_patients?:{full_name:string}|null};
 const rows=[["Created","Patient","Type","Referred To","Specialty","Facility","Reason","Urgency","Status","Appointment"],...((data||[]) as unknown as ReportRow[]).map(x=>[x.created_at,x.hospital_patients?.full_name||"",x.referral_type,x.referred_to,x.specialty,x.facility_name,x.reason,x.urgency,x.status,x.appointment_date||""])];
 const cell=(value:unknown)=>{const s=escapeSpreadsheetCell(value);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
 return new NextResponse(rows.map(r=>r.map(cell).join(",")).join("\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=referrals.csv"}});
}
