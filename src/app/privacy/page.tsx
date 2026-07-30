import type { Metadata } from "next";
import { LegalPage } from "@/components/pages/legal-page";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Privacy Policy",
  description: "Privacy policy for this hospital website.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const fallback = (
    <LegalPage
      title="Privacy Policy"
      updated="July 26, 2026"
      sections={[
        {
          heading: "Overview",
          body: "This Privacy Policy describes how the hospital handles information submitted through this website. Tenant administrators must replace this draft with their approved, versioned privacy policy before launch.",
        },
        {
          heading: "Information We Collect",
          body: "When you book an appointment or send a contact message, we may collect your name, phone number, email, age, gender, and health-related notes you provide. Patient login demo data is also stored locally in your browser.",
        },
        {
          heading: "How We Use Information",
          body: "Demo data is used only to power on-device features such as appointment history, CMS previews, and simulated confirmations (SMS/email popups). No real clinical records system is connected in this demo.",
        },
        {
          heading: "Cookies & Local Storage",
          body: "We use browser localStorage to remember theme, language, accessibility preferences, appointments, and admin CMS content. You can clear this data anytime from your browser settings.",
        },
        {
          heading: "Security",
          body: "Forms are validated and sanitized on the client. Production deployments should add HTTPS, server-side validation, authentication, encryption, and a formal privacy program before handling real patient data.",
        },
        {
          heading: "Contact",
          body: "For privacy questions about the hospital, contact us via the Contact page or call the numbers listed on the website.",
        },
      ]}
    />
  );
  return <CmsPageRenderer pageKey="privacy" fallback={fallback} />;
}
