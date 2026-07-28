import type { Metadata } from "next";
import { PackagesListingContent } from "@/components/pages/packages-listing-content";
import { listPackages } from "@/lib/health-packages/service";
import { listPublicDepartments } from "@/lib/doctors/service";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "Health Packages",
  description:
    "Lung health check packages, COPD screening, executive checkup, senior care, and post-COVID recovery packages at Sri Srinivasa Hospital, Badvel.",
  path: "/health-packages",
});

export default async function HealthPackagesPage() {
  const [packages, departments] = await Promise.all([
    listPackages(),
    listPublicDepartments(),
  ]);

  return (
    <PackagesListingContent
      packages={packages}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
