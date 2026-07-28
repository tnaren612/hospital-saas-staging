import type { Metadata } from "next";
import { PatientDashboard } from "@/components/patient/patient-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Patient Dashboard",
  description: "Secure patient portal dashboard.",
  path: "/patient/dashboard",
  noIndex: true,
});

export default function PatientDashboardPage() {
  return <PatientDashboard />;
}
