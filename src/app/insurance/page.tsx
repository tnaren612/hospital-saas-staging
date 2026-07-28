import type { Metadata } from "next";
import { InsuranceContent } from "@/components/pages/insurance-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Insurance",
  description: "Insurance partners and cashless facilitation support at Sri Srinivasa Hospital, Badvel.",
  path: "/insurance",
});

export default function InsurancePage() {
  return <InsuranceContent />;
}
