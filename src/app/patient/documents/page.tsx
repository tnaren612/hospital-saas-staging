import type { Metadata } from "next";
import { PatientDocumentsPage } from "@/components/patient/patient-documents";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "My Documents",
  path: "/patient/documents",
  noIndex: true,
});

export default function Page() {
  return <PatientDocumentsPage />;
}
