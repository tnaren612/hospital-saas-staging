import type { Metadata } from "next";
import { TestimonialsContent } from "@/components/pages/testimonials-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Testimonials",
  description: "Patient stories and reviews for Sri Srinivasa Hospital and Dr. Varaprasad Venkata Sumanth.",
  path: "/testimonials",
});

export default function TestimonialsPage() {
  return <TestimonialsContent />;
}
