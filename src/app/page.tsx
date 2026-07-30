import { Hero } from "@/components/home/hero";
import { ServicesPreview } from "@/components/home/services-preview";
import { DoctorPreview } from "@/components/home/doctor-preview";
import { AboutPreview } from "@/components/home/about-preview";
import { TestimonialsPreview } from "@/components/home/testimonials-preview";
import { CtaBanner } from "@/components/home/cta-banner";
import { HomeExtras } from "@/components/home/home-extras";
import { createMetadata } from "@/lib/seo";
import { getHospitalConfig } from "@/lib/hospital/service";
import type { Metadata } from "next";
import { CmsPageRenderer } from "@/components/cms/cms-page-renderer";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getHospitalConfig();
  return createMetadata({ path: "/", config });
}

export default function HomePage() {
  return (
    <CmsPageRenderer
      pageKey="home"
      fallback={
        <div className="page-enter">
          <Hero />
          <ServicesPreview />
          <AboutPreview />
          <DoctorPreview />
          <HomeExtras />
          <TestimonialsPreview />
          <CtaBanner />
        </div>
      }
    />
  );
}
