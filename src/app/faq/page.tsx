import type { Metadata } from "next";
import { FAQContent } from "@/components/pages/faq-content";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "FAQ",
  description:
    "Frequently asked questions about appointments, fees, emergency care, insurance, and services.",
  path: "/faq",
});

export default function FAQPage() {
  return <CmsPageRenderer pageKey="faq" fallback={<FAQContent />} />;
}
