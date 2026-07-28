import type { Metadata } from "next";
import { ContactContent } from "@/components/pages/contact-content";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Contact",
  description:
    "Contact Sri Srinivasa Hospital, Nellore Road, Badvel, Andhra Pradesh 516227. Phone, WhatsApp, email, and map.",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactContent />;
}
