import { NextResponse } from "next/server";
import { z } from "zod";
import { createPayment } from "@/lib/payments/payment-service";
import { clientIp, rateLimitAsync } from "@/lib/rate-limit";
import { requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { getTenantContext } from "@/lib/hospital/tenant";

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

/**
 * POST /api/payments/create
 * - online: public (rate-limited); amount resolved server-side when possible
 * - cash: staff only (C-05)
 */
export async function POST(request: Request) {
  // Cash is staff-only — enforce same-origin for cookie session
  // Online create is public; origin optional
  const bodyPeek = await request
    .clone()
    .json()
    .catch(() => ({}));
  if (
    bodyPeek &&
    typeof bodyPeek === "object" &&
    (bodyPeek as { payment_method?: string }).payment_method === "cash"
  ) {
    const csrf = requireSameOriginForMutation(request);
    if (csrf) return csrf;
  }

  const rl = await rateLimitAsync(`pay:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many payment attempts" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let staffAuthorized = false;
  if (parsed.data.payment_method === "cash") {
    const gate = await requireHmsAdmin();
    if (gate.error) {
      return NextResponse.json(
        {
          error: "Cash payments require staff login",
          code: "CASH_STAFF_REQUIRED",
        },
        { status: 401 }
      );
    }
    staffAuthorized = true;
  }

  // Reject mock provider from public clients in all environments for create body
  if (
    parsed.data.payment_provider === "mock" &&
    parsed.data.payment_method === "online"
  ) {
    // Service layer still gates production; allow only when staff for testing
    const gate = await requireHmsAdmin();
    if (gate.error) {
      // strip mock — service will pick razorpay/stripe or fail closed
      parsed.data.payment_provider = undefined;
    }
  }

  const tenant = await getTenantContext();

  const result = await createPayment({
    ...parsed.data,
    patient_email: parsed.data.patient_email || undefined,
    staffAuthorized,
    hospitalId: tenant.hospitalId,
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
