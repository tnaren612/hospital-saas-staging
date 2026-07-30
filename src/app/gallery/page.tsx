import type { Metadata } from "next";
import { GalleryContent } from "@/components/pages/gallery-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Gallery",
  description: "Hospital gallery featuring facilities, care spaces, and infrastructure.",
  path: "/gallery",
});

export default function GalleryPage() {
  return <GalleryContent />;
}
