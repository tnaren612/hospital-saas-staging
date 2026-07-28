import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";
import { mapDbAppointment } from "@/lib/admin/appointments";

export const dynamic = "force-dynamic";

const schema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional(),
  email: z.string().email().optional().nullable(),
  age: z.coerce.number().min(0).max(120).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  address: z.string().max(500).optional(),
  medical_history: z.string().max(5000).optional(),
  blood_group: z.string().max(10).optional().nullable(),
  emergency_contact: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data: patient, error } = await gate.supabase
    .from("hospital_patients")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: apts } = await gate.supabase
    .from("appointments")
    .select("*")
    .eq("phone", patient.phone)
    .order("date", { ascending: false });

  return NextResponse.json({
    data: {
      ...patient,
      appointments: (apts || []).map((r) =>
        mapDbAppointment(r as Record<string, unknown>)
      ),
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("hospital_patients")
    .update(parsed.data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { error } = await gate.supabase
    .from("hospital_patients")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
