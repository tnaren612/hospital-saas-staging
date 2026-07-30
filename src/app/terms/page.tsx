import type { Metadata } from "next";
import { LegalPage } from "@/components/pages/legal-page";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Terms of Use",
  description: "Terms governing use of this hospital website.",
  path: "/terms",
});

export default function TermsPage() {
  const fallback = (
    <LegalPage
      title="Terms of Use"
      updated="July 26, 2026"
      sections={[
        {
          heading: "Acceptance",
          body: "By using this website you agree to these Terms of Use. This site is a frontend demonstration of hospital digital services and is not a substitute for emergency medical care.",
        },
        {
          heading: "Medical Disclaimer",
          body: "Content on this website, including blog articles and chatbot replies, is for general information only and does not constitute personalized medical advice. Always consult a qualified clinician for diagnosis and treatment. In emergencies, call the hospital emergency number immediately.",
        },
        {
          heading: "Appointments & Demo Features",
          body: "Appointment booking, OTP login, video meetings, SMS, and email confirmations are simulated for demonstration. Connecting a production backend is required before using these features for real patients.",
        },
        {
          heading: "Intellectual Property",
          body: "Hospital branding, layout, and original content are provided for this project. Replace images and copy as needed for your deployment. Do not misuse third-party trademarks shown as demo insurance partners.",
        },
        {
          heading: "Limitation of Liability",
          body: "To the fullest extent permitted by law, the hospital and website authors are not liable for decisions made solely based on demo website content or simulated workflows.",
        },
        {
          heading: "Changes",
          body: "We may update these terms as the product evolves. Continued use of the site after changes constitutes acceptance of the revised terms.",
        },
      ]}
    />
  );
  return <CmsPageRenderer pageKey="terms" fallback={fallback} />;
}
