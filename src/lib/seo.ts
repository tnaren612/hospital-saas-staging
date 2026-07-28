import type { Metadata } from "next";
import { SITE_URL } from "@/lib/data";
import hospital from "@/data/hospital.json";
import doctor from "@/data/doctor.json";

const defaultTitle = `${hospital.name} | Pulmonology & Respiratory Care, Badvel`;
const defaultDescription = `${hospital.name} on Nellore Road, Badvel — specialist pulmonology, asthma, COPD, critical care by ${doctor.name}. Book appointments online. 24×7 emergency.`;

export function createMetadata({
  title,
  description,
  path = "",
  image = "/assets/images/hospital/og-image.svg",
  noIndex = false,
}: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
} = {}): Metadata {
  const fullTitle = title ? `${title} | ${hospital.name}` : defaultTitle;
  const desc = description || defaultDescription;
  const url = `${SITE_URL}${path}`;

  return {
    title: fullTitle,
    description: desc,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "en_IN",
      url,
      siteName: hospital.name,
      title: fullTitle,
      description: desc,
      images: [{ url: image, width: 1200, height: 630, alt: hospital.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: desc,
      images: [image],
    },
    keywords: [
      "Sri Srinivasa Hospital",
      "Badvel hospital",
      "Pulmonologist Badvel",
      "Dr Varaprasad Venkata Sumanth",
      "Asthma treatment",
      "COPD care",
      "Lung specialist Andhra Pradesh",
      "Respiratory medicine",
      "Critical care Badvel",
    ],
  };
}

export function hospitalJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Hospital",
    name: hospital.name,
    description: defaultDescription,
    url: SITE_URL,
    telephone: hospital.phones.map((p) => `+91${p}`),
    email: hospital.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${hospital.address.line1}, ${hospital.address.line2}`,
      addressLocality: hospital.address.city,
      addressRegion: hospital.address.state,
      postalCode: hospital.address.pincode,
      addressCountry: "IN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: hospital.geo.lat,
      longitude: hospital.geo.lng,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        opens: "09:00",
        closes: "20:00",
      },
    ],
    medicalSpecialty: [
      "Pulmonary",
      "Critical Care",
      "Emergency",
    ],
  };
}

export function doctorJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: doctor.name,
    medicalSpecialty: doctor.specializations,
    hospitalAffiliation: {
      "@type": "Hospital",
      name: hospital.name,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: `${hospital.address.line1}, ${hospital.address.line2}`,
      addressLocality: hospital.address.city,
      addressRegion: hospital.address.state,
      postalCode: hospital.address.pincode,
      addressCountry: "IN",
    },
    telephone: `+91${hospital.phones[0]}`,
  };
}

export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export function medicalBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: hospital.name,
    description: defaultDescription,
    url: SITE_URL,
    telephone: hospital.phones.map((p) => `+91${p}`),
    email: hospital.email,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: `${hospital.address.line1}, ${hospital.address.line2}`,
      addressLocality: hospital.address.city,
      addressRegion: hospital.address.state,
      postalCode: hospital.address.pincode,
      addressCountry: "IN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: hospital.geo.lat,
      longitude: hospital.geo.lng,
    },
    areaServed: {
      "@type": "City",
      name: hospital.address.city,
    },
    medicalSpecialty: [
      "Pulmonary",
      "Critical Care Medicine",
      "Emergency Medicine",
      "Sleep Medicine",
    ],
  };
}
