import type { Metadata } from "next";
import { FacilitiesContent } from "@/components/pages/facilities-content";
import { createMetadata } from "@/lib/seo";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export const metadata: Metadata = createMetadata({
  title: "Facilities",
  description:
    "Explore available ICU, diagnostics, OPD, pharmacy, ambulance, and patient facilities.",
  path: "/facilities",
});

export default function FacilitiesPage() {
  return <CmsPageRenderer pageKey="facilities" fallback={<FacilitiesContent />} />;
}
