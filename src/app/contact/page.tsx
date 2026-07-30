import type { Metadata } from "next";
import { ContactContent } from "@/components/pages/contact-content";
import { createMetadata } from "@/lib/seo";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export const metadata: Metadata = createMetadata({
  title: "Contact",
  description:
    "Find hospital phone, WhatsApp, email, address, business hours, and map details.",
  path: "/contact",
});

export default function ContactPage() {
  return <CmsPageRenderer pageKey="contact" fallback={<ContactContent />} />;
}
