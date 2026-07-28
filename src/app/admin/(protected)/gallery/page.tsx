import type { Metadata } from "next";
import { AdminGalleryCms } from "@/components/admin/admin-gallery-cms";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Gallery CMS",
  path: "/admin/gallery",
  noIndex: true,
});

export default function AdminGalleryPage() {
  return <AdminGalleryCms />;
}
