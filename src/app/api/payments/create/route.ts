import { NextResponse } from "next/server";
import { z } from "zod";
import { createPayment } from "@/lib/payments/payment-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  appointment_id: z.string().optional(),
  package_id: z.string().optional(),
  package_name: z.string().optional(),
  patient_id: z.string().optional(),
  patient_name: z.string().min(2),
  patient_phone: z.string().regex(/^[6-9]\d{9}$/),
  patient_email: z.string().email().optional().or(z.literal("")),
  doctor_name: z.string().optional(),
  department_name: z.string().optional(),
  amount: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  payment_method: z.enum(["cash", "online"]),
  payment_provider: z
    .enum(["none", "cash", "razorpay", "stripe", "mock"])
    .optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(`pay:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many payment attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await createPayment({
    ...parsed.data,
    patient_email: parsed.data.patient_email || undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Payment create failed" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      data: {
        payment: result.payment,
        invoice: result.invoice,
        gateway: result.gateway,
      },
    },
    { status: 201 }
  );
}
