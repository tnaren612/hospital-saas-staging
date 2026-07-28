import type { Metadata } from "next";
import { ReportsPanel } from "@/components/admin/hms/reports-panel";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Reports",
  path: "/admin/reports",
  noIndex: true,
});

export default function AdminReportsPage() {
  return <ReportsPanel />;
}
