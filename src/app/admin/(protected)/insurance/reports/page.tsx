import type { Metadata } from "next";
import { InsuranceReports } from "@/components/admin/hms/insurance/insurance-reports";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Insurance Reports",
  path: "/admin/insurance/reports",
  noIndex: true,
});

export default function InsuranceReportsPage() {
  return <InsuranceReports />;
}
