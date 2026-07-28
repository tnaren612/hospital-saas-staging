import type { Metadata } from "next";
import { PatientLoginContent } from "@/components/pages/patient-login-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Patient Login",
  description:
    "Patient portal login — phone OTP demo or secure email authentication.",
  path: "/patient/login",
  noIndex: true,
});

export default function PatientLoginPage() {
  return <PatientLoginContent />;
}
