import type { Metadata } from "next";
import { PatientPaymentsPage } from "@/components/patient/patient-payments";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Payments",
  path: "/patient/payments",
  noIndex: true,
});

export default function Page() {
  return <PatientPaymentsPage />;
}
