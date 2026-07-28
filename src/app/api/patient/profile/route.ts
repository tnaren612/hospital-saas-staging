import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPatientDashboard,
  updatePatientProfile,
} from "@/lib/patient/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getPatientDashboard();
  if (!data.patient) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ data: data.patient, mode: data.mode });
}

const patchSchema = z.object({
  first_name: z.string().min(1).max(80).optional(),
  last_name: z.string().max(80).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional()
    .or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  blood_group: z.string().max(10).optional().nullable(),
  address: z.string().max(500).optional(),
  emergency_contact: z.string().max(120).optional().nullable(),
  insurance_provider: z.string().max(120).optional().nullable(),
  insurance_number: z.string().max(80).optional().nullable(),
  profile_photo: z.string().optional(),
});

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await updatePatientProfile(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Update failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ data: result.patient });
}
