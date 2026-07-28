import type { Metadata } from "next";
import { PatientNotificationsPage } from "@/components/patient/patient-notifications";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Notifications",
  path: "/patient/notifications",
  noIndex: true,
});

export default function Page() {
  return <PatientNotificationsPage />;
}
