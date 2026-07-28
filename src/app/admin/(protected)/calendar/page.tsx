import type { Metadata } from "next";
import { AppointmentCalendar } from "@/components/admin/hms/appointment-calendar";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Appointment Calendar",
  path: "/admin/calendar",
  noIndex: true,
});

export default function AdminCalendarPage() {
  return <AppointmentCalendar />;
}
