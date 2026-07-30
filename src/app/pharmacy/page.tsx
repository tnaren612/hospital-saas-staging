import type { Metadata } from "next";
import { PharmacyManager } from "@/components/admin/hms/pharmacy-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Pharmacy",
  path: "/pharmacy",
  noIndex: true,
});

/** Pharmacist portal — production pharmacy manager. */
export default function PharmacyPortalPage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-4 px-4 py-8">
      <PharmacyManager />
    </div>
  );
}
