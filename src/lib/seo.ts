import type { Metadata } from "next";
import { buildDefaultHospitalConfig } from "@/lib/hospital/defaults";
import type { HospitalConfig } from "@/lib/hospital/types";
import { getTenantContext } from "@/lib/hospital/tenant";
import { getHospitalConfig } from "@/lib/hospital/service";

function postalAddress(config: HospitalConfig) {
  return {
    "@type": "PostalAddress",
    streetAddress: [
      config.contact.address_line1,
      config.contact.address_line2,
    ]
      .filter(Boolean)
      .join(", "),
    addressLocality: config.contact.city,
    addressRegion: config.contact.state,
    postalCode: config.contact.pincode,
    addressCountry: config.contact.country,
  };
}

export function createMetadata({
  title,
  description,
  path = "",
  image = "/assets/images/hospital/og-image.svg",
  noIndex = false,
  config = buildDefaultHospitalConfig(),
}: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  config?: HospitalConfig;
} = {}): Metadata {
  const name = config.branding.name;
  const fullTitle = title
    ? `${title} | ${name}`
    : config.seo.meta_title || name;
  const desc =
    description ||
    config.seo.meta_description ||
    config.branding.tagline ||
    name;
  const siteUrl = (config.contact.website || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const url = `${siteUrl}${path}`;
  const socialImage = config.seo.og_image_url || image;

  return {
    title: fullTitle,
    description: desc,
    metadataBase: new URL(siteUrl),
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: config.localization.language,
      url,
      siteName: name,
      title: fullTitle,
      description: desc,
      images: [{ url: socialImage, width: 1200, height: 630, alt: name }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: desc,
      images: [socialImage],
    },
    keywords: config.seo.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  };
}

/** Resolve tenant-aware metadata for public App Router pages. */
export async function createTenantMetadata(options: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
} = {}): Promise<Metadata> {
  const tenant = await getTenantContext();
  const config = await getHospitalConfig({ slug: tenant.slug });
  return createMetadata({ ...options, config });
}

export function hospitalJsonLd(config: HospitalConfig) {
  return {
    "@context": "https://schema.org",
    "@type": "Hospital",
    name: config.branding.name,
    description: config.seo.meta_description || config.branding.tagline,
    url: config.contact.website,
    logo: config.branding.logo_url,
    image: config.seo.og_image_url || config.branding.banner_url,
    telephone: config.contact.phones,
    email: config.contact.email,
    address: postalAddress(config),
    geo:
      config.contact.lat !== null && config.contact.lng !== null
        ? {
            "@type": "GeoCoordinates",
            latitude: config.contact.lat,
            longitude: config.contact.lng,
          }
        : undefined,
  };
}

export function doctorJsonLd(
  config: HospitalConfig,
  doctor: { name: string; specializations?: string[] }
) {
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: doctor.name,
    medicalSpecialty: doctor.specializations || [],
    hospitalAffiliation: {
      "@type": "Hospital",
      name: config.branding.name,
    },
    address: postalAddress(config),
    telephone:
      config.contact.phones[0] || config.contact.emergency_phone || undefined,
  };
}

export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function medicalBusinessJsonLd(config: HospitalConfig) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: config.branding.name,
    description: config.seo.meta_description || config.branding.tagline,
    url: config.contact.website,
    telephone: config.contact.phones,
    email: config.contact.email,
    priceRange: config.localization.currency_symbol
      ? `${config.localization.currency_symbol}${config.localization.currency_symbol}`
      : undefined,
    address: postalAddress(config),
    geo:
      config.contact.lat !== null && config.contact.lng !== null
        ? {
            "@type": "GeoCoordinates",
            latitude: config.contact.lat,
            longitude: config.contact.lng,
          }
        : undefined,
    areaServed: config.contact.city
      ? { "@type": "City", name: config.contact.city }
      : undefined,
  };
}
