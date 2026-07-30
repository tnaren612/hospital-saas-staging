import type { Metadata } from "next";
import { InsuranceContent } from "@/components/pages/insurance-content";
import { createMetadata } from "@/lib/seo";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export const metadata: Metadata = createMetadata({
  title: "Insurance",
  description: "Insurance partners and cashless facilitation information.",
  path: "/insurance",
});

export default function InsurancePage() {
  return <CmsPageRenderer pageKey="insurance" fallback={<InsuranceContent />} />;
}
