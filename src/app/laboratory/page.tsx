import type { Metadata } from "next";
import { LabManager } from "@/components/admin/hms/lab-manager";
import { PortalLogout } from "@/components/auth/portal-logout";
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
    <div className="container mx-auto max-w-6xl space-y-4 px-4 py-8">
      <PortalLogout />
      <LabManager />
    </div>
  );
}
