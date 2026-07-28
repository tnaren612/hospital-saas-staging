import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DoctorProfileContent } from "@/components/pages/doctor-profile-content";
import {
  breadcrumbJsonLd,
  getDoctorBySlug,
  getRelatedDoctors,
  physicianJsonLd,
} from "@/lib/doctors/service";
import { createMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/data";
import { faqJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

type PageProps = { params: { slug: string } };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const doctor = await getDoctorBySlug(params.slug);
  if (!doctor) {
    return createMetadata({
      title: "Doctor not found",
      path: `/doctors/${params.slug}`,
      noIndex: true,
    });
  }

  return createMetadata({
    title: doctor.seo_title || doctor.name,
    description:
      doctor.seo_description ||
      doctor.biography?.slice(0, 160) ||
      `${doctor.name} — ${doctor.title} at Sri Srinivasa Hospital, Badvel.`,
    path: `/doctors/${doctor.slug || doctor.id}`,
    image: doctor.photo_url || "/assets/images/hospital/og-image.svg",
  });
}

export default async function DoctorSlugPage({ params }: PageProps) {
  const doctor = await getDoctorBySlug(params.slug);
  if (!doctor) notFound();

  const related = await getRelatedDoctors(doctor, 3);
  const site = SITE_URL;

  const schemas: unknown[] = [
    physicianJsonLd(doctor, site),
    breadcrumbJsonLd(
      [
        { name: "Home", path: "/" },
        { name: "Doctors", path: "/doctors" },
        {
          name: doctor.name,
          path: `/doctors/${doctor.slug || doctor.id}`,
        },
      ],
      site
    ),
  ];

  if (doctor.faqs?.length) {
    schemas.push(faqJsonLd(doctor.faqs));
  }

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
