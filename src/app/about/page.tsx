import type { Metadata } from "next";
import { AboutContent } from "@/components/pages/about-content";
import { createMetadata } from "@/lib/seo";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export const metadata: Metadata = createMetadata({
  title: "About Us",
  description:
    "Learn about the hospital, its mission, values, services, and commitment to care.",
  path: "/about",
});

export default function AboutPage() {
  return <CmsPageRenderer pageKey="about" fallback={<AboutContent />} />;
}
