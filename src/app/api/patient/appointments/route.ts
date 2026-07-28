import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelPatientAppointment,
  getPatientAppointments,
  reschedulePatientAppointment,
} from "@/lib/patient/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPatientAppointments();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["cancel", "reschedule"]),
  date: z.string().optional(),
  timeSlot: z.string().optional(),
});

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id, action, date, timeSlot } = parsed.data;

  if (action === "cancel") {
    const res = await cancelPatientAppointment(id);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error || "Cancel failed" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (!date || !timeSlot) {
    return NextResponse.json(
      { error: "date and timeSlot required for reschedule" },
      { status: 400 }
    );
  }

  const res = await reschedulePatientAppointment(id, date, timeSlot);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Reschedule failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
