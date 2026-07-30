import { CareersContent } from "@/components/pages/careers-content";
import { createMetadata } from "@/lib/seo";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export const metadata = createMetadata({
  title: "Careers",
  description:
    "Explore nursing, front desk, diagnostics, and clinical support careers.",
  path: "/careers",
});

export default function CareersPage() {
  return <CmsPageRenderer pageKey="careers" fallback={<CareersContent />} />;
}
