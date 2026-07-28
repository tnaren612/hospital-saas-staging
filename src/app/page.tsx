import { Hero } from "@/components/home/hero";
import { ServicesPreview } from "@/components/home/services-preview";
import { DoctorPreview } from "@/components/home/doctor-preview";
import { AboutPreview } from "@/components/home/about-preview";
import { TestimonialsPreview } from "@/components/home/testimonials-preview";
import { CtaBanner } from "@/components/home/cta-banner";
import { HomeExtras } from "@/components/home/home-extras";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: undefined,
  path: "/",
  description:
    "Sri Srinivasa Hospital, Badvel — specialist pulmonology, asthma, COPD, critical care, and 24×7 emergency respiratory care. Book appointments online.",
});

export default function HomePage() {
  return (
    <div className="page-enter">
      <Hero />
      <ServicesPreview />
      <AboutPreview />
      <DoctorPreview />
      <HomeExtras />
      <TestimonialsPreview />
      <CtaBanner />
    </div>
  );
}
