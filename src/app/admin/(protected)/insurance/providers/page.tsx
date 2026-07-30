import type { Metadata } from "next";
import { InsuranceProvidersManager } from "@/components/admin/hms/insurance/providers-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Insurance Providers",
  path: "/admin/insurance/providers",
  noIndex: true,
});

export default function InsuranceProvidersPage() {
  return <InsuranceProvidersManager />;
}
