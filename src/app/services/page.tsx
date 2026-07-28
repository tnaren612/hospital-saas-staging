import type { Metadata } from "next";
import { ServicesContent } from "@/components/pages/services-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Services",
  description:
    "Pulmonology, asthma care, COPD management, critical care, sleep medicine, video consultation, and emergency services at Sri Srinivasa Hospital.",
  path: "/services",
});

export default function ServicesPage() {
  return <ServicesContent />;
}
