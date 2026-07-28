import type { Metadata } from "next";
import { FacilitiesContent } from "@/components/pages/facilities-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Facilities",
  description:
    "Explore ICU, diagnostics, OPD, pharmacy, ambulance, and patient lounge facilities at Sri Srinivasa Hospital.",
  path: "/facilities",
});

export default function FacilitiesPage() {
  return <FacilitiesContent />;
}
