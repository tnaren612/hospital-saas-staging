import type { Metadata } from "next";
import { BillingManager } from "@/components/admin/hms/billing-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Billing & Payments",
  path: "/admin/billing",
  noIndex: true,
});

export default function AdminBillingPage() {
  return <BillingManager />;
}
