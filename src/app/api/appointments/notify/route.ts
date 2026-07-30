/**
 * POST /api/appointments/notify
 * Public (rate-limited) — send confirmation email + Meta WhatsApp
 * after a booking is saved (including local / demo fallback).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { sendBookingConfirmations } from "@/lib/notifications/booking-confirm";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import hospitalJson from "@/data/hospital.json";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  patientName: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  doctorName: z.string().min(2).optional(),
  departmentName: z.string().optional(),
  date: z.string().min(8),
  timeSlot: z.string().min(3),
  type: z.string().optional(),
  bookingRef: z.string().optional(),
  appointmentId: z.string().optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(`appt-notify:${clientIp(request)}`, 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMIT" },
      { status: 429 }
    );
  }

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const hospital = hospitalJson as { name: string; phones?: string[] };

    const result = await sendBookingConfirmations({
      patientName: data.patientName,
      phone: data.phone,
      email: data.email,
      doctorName:
        data.doctorName || "Doctor",
      departmentName: data.departmentName || "Pulmonology",
      date: data.date,
      timeSlot: data.timeSlot,
      type: data.type || "in-person",
      bookingRef: data.bookingRef,
      appointmentId: data.appointmentId || null,
      hospitalName: hospital.name,
      hospitalPhone: hospital.phones?.[0],
    });

    return NextResponse.json({
      ok: result.email.sent || result.whatsapp.ok,
      notifications: {
        email: result.email.sent,
        emailError: result.email.error,
        whatsapp: result.whatsapp,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Notify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
