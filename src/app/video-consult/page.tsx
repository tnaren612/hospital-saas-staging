import type { Metadata } from "next";
import { VideoConsultContent } from "@/components/pages/video-consult-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Video Consultation",
  description: "Book and join demo video consultations with our pulmonologist.",
  path: "/video-consult",
});

export default function VideoConsultPage() {
  return <VideoConsultContent />;
}
