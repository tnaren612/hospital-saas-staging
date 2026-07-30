import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { requireHmsAdmin } from "@/lib/hms/server";

const roles = [ROLES.DOCTOR, ROLES.MANAGER, ROLES.RADIOLOGY_TECHNICIAN];
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export async function GET() {
  const g = await requireHmsAdmin(roles);
  if (g.error || !g.supabase) return g.error!;
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const { data, error } = await g.supabase.from("radiology_studies")
    .select("study_number,modality,body_part,priority,status,scheduled_at,reported_at,impression,hospital_patients(full_name)")
    .eq("hospital_id", tenant.hospitalId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  type Row = {
    study_number: string; modality: string; body_part: string; priority: string; status: string;
    scheduled_at: string | null; reported_at: string | null; impression: string | null;
    hospital_patients?: { full_name: string } | null;
  };
  const header = ["Study", "Patient", "Modality", "Body part", "Priority", "Status", "Scheduled", "Reported", "Impression"];
  const rows = (data as unknown as Row[] || []).map((row) => [
    row.study_number, row.hospital_patients?.full_name, row.modality, row.body_part, row.priority,
    row.status, row.scheduled_at, row.reported_at, row.impression,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="radiology-report.csv"',
    },
  });
}
