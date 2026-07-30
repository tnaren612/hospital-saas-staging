import type { Metadata } from "next";
import { AppointmentContent } from "@/components/pages/appointment-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Book Appointment",
  description:
    "Book an in-person or video appointment with an available specialist.",
  path: "/appointment",
});

export default function AppointmentPage() {
  return <AppointmentContent />;
}
