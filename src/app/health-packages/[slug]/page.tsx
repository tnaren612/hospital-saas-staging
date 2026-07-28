import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageDetailContent } from "@/components/pages/package-detail-content";
import {
  getPackageBySlug,
  getRelatedPackages,
  packageBreadcrumbJsonLd,
  packageJsonLd,
  packageServiceJsonLd,
} from "@/lib/health-packages/service";
import { listPublicDoctors } from "@/lib/doctors/service";
import { createMetadata, faqJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/data";

export const dynamic = "force-dynamic";

type PageProps = { params: { slug: string } };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const pkg = await getPackageBySlug(params.slug);
  if (!pkg) {
    return createMetadata({
      title: "Package not found",
      path: `/health-packages/${params.slug}`,
      noIndex: true,
    });
  }
  return createMetadata({
    title: pkg.seo_title || pkg.name,
    description:
      pkg.seo_description ||
      pkg.short_description ||
      pkg.description.slice(0, 160),
    path: `/health-packages/${pkg.slug}`,
    image:
      pkg.hero_image ||
      pkg.banner_image ||
      "/assets/images/hospital/og-image.svg",
  });
}

export default async function HealthPackageDetailPage({ params }: PageProps) {
  const pkg = await getPackageBySlug(params.slug);
  if (!pkg) notFound();

  const [related, doctors] = await Promise.all([
    getRelatedPackages(pkg, 3),
    pkg.department_id
      ? listPublicDoctors({ departmentId: pkg.department_id })
      : listPublicDoctors(),
  ]);

  const site = SITE_URL;
  const schemas: unknown[] = [
    packageJsonLd(pkg, site),
    packageServiceJsonLd(pkg, site),
    packageBreadcrumbJsonLd(pkg, site),
    {
      "@context": "https://schema.org",
      "@type": "MedicalBusiness",
      name: "Sri Srinivasa Hospital",
      url: site,
      medicalSpecialty: pkg.package_type,
    },
  ];
  if (pkg.faqs.length) schemas.push(faqJsonLd(pkg.faqs));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemas) }}
      />
      <PackageDetailContent
        pkg={pkg}
        related={related}
        doctors={doctors.slice(0, 4)}
      />
    </>
  );
}
