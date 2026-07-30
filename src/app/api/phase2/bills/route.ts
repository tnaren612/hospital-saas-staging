import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { createHospitalBill, listHospitalBills } from "@/lib/phase2/service";
import { hospitalBillSchema } from "@/lib/phase2/validation";
import { getNotificationService } from "@/lib/notifications/notification-service";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { getHospitalConfig } from "@/lib/hospital/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin(rolesForPhase2Module("bills"));
  if (gate.error) return gate.error;
  const tenant = await getTenantContext();
  const data = await listHospitalBills({ hospitalId: tenant.hospitalId });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(rolesForPhase2Module("bills"));
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const body = await request.json().catch(() => ({}));
  const parsed = hospitalBillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const bill = await createHospitalBill(parsed.data, {
    hospitalId: tenant.hospitalId,
  });

  try {
    if (bill.patient_phone && bill.payment_status === "paid") {
      const config = await getHospitalConfig({ slug: tenant.slug });
      const notify = getNotificationService();
      await notify.send({
        channel: "whatsapp",
        templateId: "payment_success",
        recipient: bill.patient_phone,
        force: true,
        provider: "meta",
        vars: {
          patientName: bill.patient_name,
          amount: bill.grand_total,
          amountLabel: `Rs ${bill.grand_total.toFixed(2)}`,
          invoiceNumber: bill.bill_number,
          paymentMethod: bill.payment_method,
          hospitalName: config.branding.name,
        },
      });
    }
  } catch {
    /* non-blocking */
  }

  return NextResponse.json({ data: bill }, { status: 201 });
}
