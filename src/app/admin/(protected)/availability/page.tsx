import type { Metadata } from "next";
import { AvailabilityManager } from "@/components/admin/hms/availability-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Doctor Availability",
  path: "/admin/availability",
  noIndex: true,
});

export default function AdminAvailabilityPage() {
  return <AvailabilityManager />;
}
