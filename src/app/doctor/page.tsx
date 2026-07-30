import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFeaturedDoctor } from "@/lib/doctors/service";
import { createMetadata } from "@/lib/seo";
import { DoctorProfileContent } from "@/components/pages/doctor-profile-content";
import {
  breadcrumbJsonLd,
  getRelatedDoctors,
  physicianJsonLd,
} from "@/lib/doctors/service";
import { SITE_URL } from "@/lib/data";
import { faqJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const doctor = await getFeaturedDoctor();
  return createMetadata({
    title: doctor.seo_title || doctor.name,
    description:
      doctor.seo_description ||
      doctor.biography?.slice(0, 160) ||
      "Meet our consultant and review available services.",
    path: "/doctor",
    image: doctor.photo_url || "/assets/images/hospital/og-image.svg",
  });
}

/**
 * Legacy /doctor route — shows featured doctor profile.
 * Prefer /doctors and /doctors/[slug] for multi-doctor SEO.
 * If featured doctor has a slug, keep content here for existing links.
 */
export default async function DoctorPage() {
  const doctor = await getFeaturedDoctor();

  // Optional: send users with slug to canonical multi-doctor URL in future.
  // Keeping render-in-place preserves existing inbound links & nav.
  if (!doctor) {
    redirect("/doctors");
  }

  const related = await getRelatedDoctors(doctor, 3);
  const site = SITE_URL;
  const schemas: unknown[] = [
    physicianJsonLd(doctor, site),
    breadcrumbJsonLd(
      [
        { name: "Home", path: "/" },
        { name: "Doctor", path: "/doctor" },
      ],
      site
    ),
  ];
  if (doctor.faqs?.length) schemas.push(faqJsonLd(doctor.faqs));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemas) }}
      />
      <DoctorProfileContent doctor={doctor} related={related} />
    </>
  );
}
