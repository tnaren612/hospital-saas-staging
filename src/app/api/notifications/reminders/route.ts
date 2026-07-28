import { NextResponse } from "next/server";
import { dispatchReminders, type ReminderCandidate } from "@/lib/notifications/reminder-scheduler";
import { createClient } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/reminders
 * Cron-friendly: evaluate upcoming appointments and send 24h/2h/30m reminders.
 * Auth: CRON_SECRET header or admin-less when CRON_SECRET matches.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const auth =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-cron-secret") ||
    "";

  if (secret && auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    candidates?: ReminderCandidate[];
  };

  let candidates = body.candidates || [];

  // Load from Supabase if no candidates provided
  if (!candidates.length && hasSupabaseConfig()) {
    const key = getServiceRoleKey() || getSupabaseAnonKey()!;
    const sb = createClient(getSupabaseUrl()!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const today = new Date();
    const inTwoDays = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    const from = today.toISOString().slice(0, 10);
    const to = inTwoDays.toISOString().slice(0, 10);

    const { data } = await sb
      .from("appointments")
      .select(
        "id, patient_id, patient_name, patient_email, patient_phone, doctor_name, appointment_date, time_slot, type, status"
      )
      .gte("appointment_date", from)
      .lte("appointment_date", to)
      .in("status", ["confirmed", "pending", "upcoming"])
      .limit(200);

    candidates = (data || []).map((row) => ({
      appointmentId: String(row.id),
      patientId: row.patient_id ? String(row.patient_id) : undefined,
      patientName: String(row.patient_name || "Patient"),
      patientEmail: row.patient_email ? String(row.patient_email) : undefined,
      patientPhone: row.patient_phone ? String(row.patient_phone) : undefined,
      doctorName: String(row.doctor_name || "Doctor"),
      date: String(row.appointment_date || "").slice(0, 10),
      timeSlot: String(row.time_slot || ""),
      type: row.type ? String(row.type) : undefined,
    }));
  }

  const result = await dispatchReminders(candidates);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/notifications/reminders",
    windows: ["24h", "2h", "30m"],
    auth: "Bearer CRON_SECRET or x-cron-secret",
  });
}
