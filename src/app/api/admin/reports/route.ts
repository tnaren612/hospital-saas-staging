import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

function defaultFee(row: { consultation_fee?: number | null }) {
  const n = Number(row.consultation_fee);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const doctorId = searchParams.get("doctor_id");
  const departmentId = searchParams.get("department_id");
  const groupBy = searchParams.get("group_by") || "daily";

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const tenant = await getTenantContext();
  let query = gate.supabase
    .from("appointments")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date");

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (doctorId) query = query.eq("doctor_id", doctorId);

  let { data, error } = await query;
  if (error && /hospital_id|column/i.test(error.message)) {
    let fb = gate.supabase
      .from("appointments")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (doctorId) fb = fb.eq("doctor_id", doctorId);
    const retry = await fb;
    data = retry.data;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = data || [];

  // Department filter via hospital_doctors map
  if (departmentId) {
    let docsQ = gate.supabase
      .from("hospital_doctors")
      .select("id, name")
      .eq("department_id", departmentId);
    if (tenant.hospitalId) {
      docsQ = docsQ.eq("hospital_id", tenant.hospitalId);
    }
    const { data: docs } = await docsQ;
    const names = new Set((docs || []).map((d) => d.name));
    const ids = new Set((docs || []).map((d) => d.id));
    rows = rows.filter(
      (r) => ids.has(r.doctor_id) || names.has(r.doctor_name)
    );
  }

  const appointments = rows.map((r) =>
    mapDbAppointment(r as Record<string, unknown>)
  );

  const completed = rows.filter((r) => r.status === "completed");
  const confirmed = rows.filter(
    (r) => r.status === "confirmed" || r.status === "upcoming"
  );
  const cancelled = rows.filter((r) => r.status === "cancelled");
  const revenue = completed.reduce((sum, r) => sum + defaultFee(r), 0);

  // Groupings
  const byDay: Record<string, { count: number; revenue: number }> = {};
  const byDoctor: Record<string, { count: number; revenue: number }> = {};

  rows.forEach((r) => {
    const day = r.date;
    if (!byDay[day]) byDay[day] = { count: 0, revenue: 0 };
    byDay[day].count += 1;
    if (r.status === "completed") byDay[day].revenue += defaultFee(r);

    const doc = r.doctor_name || r.doctor_id;
    if (!byDoctor[doc]) byDoctor[doc] = { count: 0, revenue: 0 };
    byDoctor[doc].count += 1;
    if (r.status === "completed") byDoctor[doc].revenue += defaultFee(r);
  });

  const exportRows = appointments.map((a) => ({
    Date: a.date,
    Time: a.timeSlot,
    Patient: a.patientName,
    Phone: a.phone,
    Doctor: a.doctorName,
    Type: a.type,
    Status: a.status,
    Problem: a.problem,
  }));

  return NextResponse.json({
    summary: {
      total: rows.length,
      completed: completed.length,
      confirmed: confirmed.length,
      cancelled: cancelled.length,
      revenue,
      from,
      to,
      group_by: groupBy,
    },
    by_day: Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
    by_doctor: Object.entries(byDoctor).map(([doctor, v]) => ({
      doctor,
      ...v,
    })),
    appointments,
    export_rows: exportRows,
  });
}
