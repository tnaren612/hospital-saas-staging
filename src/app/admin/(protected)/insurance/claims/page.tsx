import type { Metadata } from "next";
import { ClaimsManager } from "@/components/admin/hms/insurance/claims-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Insurance Claims",
  path: "/admin/insurance/claims",
  noIndex: true,
});

export default function InsuranceClaimsPage() {
  return <ClaimsManager />;
}
