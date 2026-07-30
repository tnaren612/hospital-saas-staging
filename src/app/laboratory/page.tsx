import type { Metadata } from "next";
import { LabManager } from "@/components/admin/hms/lab-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Laboratory",
  path: "/laboratory",
  noIndex: true,
});

/**
 * Lab technician portal — same production LabManager as /admin/lab.
 * Route guard: lab_technician, doctor, admin, manager (roles.ts).
 */
export default function LaboratoryPortalPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <LabManager />
    </div>
  );
}
