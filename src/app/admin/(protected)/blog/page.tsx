import type { Metadata } from "next";
import { AdminBlogCms } from "@/components/admin/admin-blog-cms";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Health Tips CMS",
  path: "/admin/blog",
  noIndex: true,
});

export default function AdminBlogPage() {
  return <AdminBlogCms />;
}
