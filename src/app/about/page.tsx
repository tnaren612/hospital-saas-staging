import type { Metadata } from "next";
import { AboutContent } from "@/components/pages/about-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "About Us",
  description:
    "Learn about Sri Srinivasa Hospital in Badvel — our mission, values, and commitment to excellence in pulmonology and critical care.",
  path: "/about",
});

export default function AboutPage() {
  return <AboutContent />;
}
