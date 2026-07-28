import type { Metadata } from "next";
import { FAQContent } from "@/components/pages/faq-content";
import { createMetadata, faqJsonLd } from "@/lib/seo";
import faqJson from "@/data/faq.json";

export const metadata: Metadata = createMetadata({
  title: "FAQ",
  description:
    "Frequently asked questions about appointments, fees, emergency care, insurance, and services at Sri Srinivasa Hospital.",
  path: "/faq",
});

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqJsonLd(
              (faqJson as { question: string; answer: string }[]).map((f) => ({
                question: f.question,
                answer: f.answer,
              }))
            )
          ),
        }}
      />
      <FAQContent />
    </>
  );
}
