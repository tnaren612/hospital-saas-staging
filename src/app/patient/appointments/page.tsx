import type { Metadata } from "next";
import { PatientAppointmentsPage } from "@/components/patient/patient-appointments";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "My Appointments",
  path: "/patient/appointments",
  noIndex: true,
});

export default function Page() {
  return <PatientAppointmentsPage />;
}
