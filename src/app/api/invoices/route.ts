import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { listInvoices } from "@/lib/payments/payment-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const phone = new URL(request.url).searchParams.get("phone") || undefined;
  const data = await listInvoices({ patient_phone: phone, limit: 200 });
  return NextResponse.json({ data });
}
