import type { Metadata } from "next";
import { InsuranceDashboard } from "@/components/admin/hms/insurance/insurance-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Insurance Dashboard",
  path: "/admin/insurance",
  noIndex: true,
});

export default function InsurancePage() {
  return <InsuranceDashboard />;
}
