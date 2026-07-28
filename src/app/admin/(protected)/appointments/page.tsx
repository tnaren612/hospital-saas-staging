import type { Metadata } from "next";
import { AdminAppointments } from "@/components/admin/admin-appointments";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Appointments Dashboard",
  path: "/admin/appointments",
  noIndex: true,
});

export default function AdminAppointmentsPage() {
  return <AdminAppointments />;
}
