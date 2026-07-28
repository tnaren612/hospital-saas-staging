import { CareersContent } from "@/components/pages/careers-content";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Careers",
  description:
    "Join Sri Srinivasa Hospital, Badvel — nursing, front desk, diagnostics, and clinical support roles.",
  path: "/careers",
});

export default function CareersPage() {
  return <CareersContent />;
}
