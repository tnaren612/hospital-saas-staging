import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { createPrescription, listPrescriptions } from "@/lib/phase2/service";
import { prescriptionSchema } from "@/lib/phase2/validation";
import { getNotificationService } from "@/lib/notifications/notification-service";
import { rolesForPhase2Module, ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { getHospitalConfig } from "@/lib/hospital/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin(rolesForPhase2Module("prescriptions"));
  if (gate.error) return gate.error;
  const tenant = await getTenantContext();
  const data = await listPrescriptions({ hospitalId: tenant.hospitalId });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin([
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.DOCTOR,
  ]);
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const body = await request.json().catch(() => ({}));
  const parsed = prescriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rx = await createPrescription(
    {
      patient_name: parsed.data.patient_name,
      patient_phone: parsed.data.patient_phone,
      patient_age: parsed.data.patient_age,
      patient_gender: parsed.data.patient_gender || "",
      doctor_name: parsed.data.doctor_name,
      doctor_reg_no: parsed.data.doctor_reg_no || "",
      appointment_id: parsed.data.appointment_id,
      diagnosis: parsed.data.diagnosis,
      notes: parsed.data.notes || "",
      follow_up_date: parsed.data.follow_up_date,
      medicines: parsed.data.medicines,
    },
    opts
  );

  try {
    if (parsed.data.patient_phone) {
      const config = await getHospitalConfig({ slug: tenant.slug });
      const notify = getNotificationService();
      await notify.send({
        channel: "whatsapp",
        templateId: "prescription_ready",
        recipient: parsed.data.patient_phone,
        force: true,
        provider: "meta",
        vars: {
          patientName: rx.patient_name,
          doctorName: rx.doctor_name,
          bookingRef: rx.prescription_number,
          hospitalName: config.branding.name,
        },
      });
    }
  } catch {
    /* non-blocking */
  }

  return NextResponse.json({ data: rx }, { status: 201 });
}
