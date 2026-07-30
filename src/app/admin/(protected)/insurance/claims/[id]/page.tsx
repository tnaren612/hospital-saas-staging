import type { Metadata } from "next";
import { ClaimDetailView } from "@/components/admin/hms/insurance/claim-detail";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Claim Details",
  path: "/admin/insurance/claims",
  noIndex: true,
});

export default function ClaimDetailPage() {
  return <ClaimDetailView />;
}
