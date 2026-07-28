import type { Metadata } from "next";
import { PatientReportsPage } from "@/components/patient/patient-reports";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "My Reports",
  path: "/patient/reports",
  noIndex: true,
});

export default function Page() {
  return <PatientReportsPage />;
}
