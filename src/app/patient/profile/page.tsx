import type { Metadata } from "next";
import { PatientProfilePage } from "@/components/patient/patient-profile";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "My Profile",
  path: "/patient/profile",
  noIndex: true,
});

export default function Page() {
  return <PatientProfilePage />;
}
