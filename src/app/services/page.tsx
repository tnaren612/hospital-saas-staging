import type { Metadata } from "next";
import { ServicesContent } from "@/components/pages/services-content";
import { createMetadata } from "@/lib/seo";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export const metadata: Metadata = createMetadata({
  title: "Services",
  description:
    "Clinical services, consultations, diagnostics, critical care, and emergency support.",
  path: "/services",
});

export default function ServicesPage() {
  return <CmsPageRenderer pageKey="services" fallback={<ServicesContent />} />;
}
