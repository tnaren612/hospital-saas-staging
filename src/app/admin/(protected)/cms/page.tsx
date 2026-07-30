import type { Metadata } from "next";
import { AdminPageCms } from "@/components/admin/admin-page-cms";
import { AdminSiteCms } from "@/components/admin/admin-site-cms";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Website CMS",
  path: "/admin/cms",
  noIndex: true,
});

export default function AdminCmsPage() {
  return (
    <div className="space-y-10">
      <AdminPageCms />
      <AdminSiteCms />
    </div>
  );
}
