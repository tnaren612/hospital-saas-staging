import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  doctor_id: z.string().uuid(),
  date: z.string().min(8),
  status: z.enum(["available", "on_leave", "holiday", "emergency"]),
  note: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctor_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = gate.supabase
    .from("doctor_availability")
    .select("*, doctor:hospital_doctors(id, name)")
    .order("date");

  if (doctorId) query = query.eq("doctor_id", doctorId);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("doctor_availability")
    .upsert(
      {
        doctor_id: parsed.data.doctor_id,
        date: parsed.data.date,
        status: parsed.data.status,
        note: parsed.data.note || "",
      },
      { onConflict: "doctor_id,date" }
    )
    .select("*, doctor:hospital_doctors(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
