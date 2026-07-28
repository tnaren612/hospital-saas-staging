import type { Metadata } from "next";
import { PackagesManager } from "@/components/admin/hms/packages-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Health Packages CMS",
  path: "/admin/packages",
  noIndex: true,
});

export default function AdminPackagesPage() {
  return <PackagesManager />;
}
