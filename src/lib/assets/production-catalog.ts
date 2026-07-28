/**
 * Production media catalog — local optimized photos (Unsplash License).
 * CMS Gallery uploads override these when present.
 */

export type ProductionAsset = {
  id: string;
  src: string;
  fallback: string;
  alt: string;
  category: string;
  width: number;
  height: number;
  section?: string;
  key?: string;
  /** Original Unsplash photo id for license attribution */
  licenseSource?: string;
};

export const PRODUCTION_ASSETS: ProductionAsset[] = [
  {
    id: "hero-hospital",
    src: "/images/hero/hospital-hero.jpg",
    fallback: "/images/hospital/hero.jpg",
    alt: "Modern hospital exterior and entrance",
    category: "hospital",
    width: 1600,
    height: 900,
    section: "home",
    key: "hero",
    licenseSource: "unsplash:photo-1519494026892-80bbd2d6fd0d",
  },
  {
    id: "hospital-building",
    src: "/images/hospital/building.jpg",
    fallback: "/images/about/hospital-care.jpg",
    alt: "Hospital building and care campus",
    category: "hospital",
    width: 1400,
    height: 900,
    section: "home",
    key: "about",
    licenseSource: "unsplash:photo-1587351021759-3e566b6af7cc",
  },
  {
    id: "reception",
    src: "/images/gallery/reception.jpg",
    fallback: "/images/gallery/waiting-area.jpg",
    alt: "Hospital reception and patient waiting area",
    category: "hospital",
    width: 1200,
    height: 800,
    section: "gallery",
    key: "reception",
  },
  {
    id: "icu",
    src: "/images/gallery/icu.jpg",
    fallback: "/images/facilities/icu.jpg",
    alt: "Intensive care and critical care environment",
    category: "facilities",
    width: 1200,
    height: 800,
    section: "gallery",
    key: "icu",
  },
  {
    id: "consultation",
    src: "/images/gallery/consultation.jpg",
    fallback: "/images/doctors/gallery-2.jpg",
    alt: "Doctor consulting with a patient",
    category: "care",
    width: 1200,
    height: 800,
    section: "gallery",
    key: "consultation",
  },
  {
    id: "diagnostics",
    src: "/images/gallery/diagnostics.jpg",
    fallback: "/images/facilities/diagnostics.jpg",
    alt: "Medical diagnostics and imaging equipment",
    category: "facilities",
    width: 1200,
    height: 800,
  },
  {
    id: "pharmacy",
    src: "/images/gallery/pharmacy.jpg",
    fallback: "/images/facilities/pharmacy.jpg",
    alt: "Hospital pharmacy and medications",
    category: "facilities",
    width: 1200,
    height: 800,
  },
  {
    id: "emergency",
    src: "/images/gallery/ambulance.jpg",
    fallback: "/images/services/emergency.jpg",
    alt: "Emergency medical response",
    category: "emergency",
    width: 1200,
    height: 800,
  },
  {
    id: "opd",
    src: "/images/gallery/opd.jpg",
    fallback: "/images/facilities/opd.jpg",
    alt: "Outpatient consultation room",
    category: "facilities",
    width: 1200,
    height: 800,
  },
  {
    id: "operation-theatre",
    src: "/images/gallery/operation-theatre.jpg",
    fallback: "/images/gallery/medical-equipment.jpg",
    alt: "Surgical and procedure environment",
    category: "facilities",
    width: 1200,
    height: 800,
  },
  {
    id: "doctor-profile",
    src: "/images/doctors/lead-specialist.jpg",
    fallback: "/images/doctors/default-doctor.jpg",
    alt: "Lead specialist pulmonologist in clinical attire",
    category: "doctors",
    width: 900,
    height: 1100,
    section: "doctor",
    key: "profile",
    licenseSource: "unsplash:photo-1612349317150-e413f6a5b16d",
  },
];

export function getAsset(id: string): ProductionAsset | undefined {
  return PRODUCTION_ASSETS.find((a) => a.id === id);
}

export function getAssetSrc(id: string, preferRemote = true): string {
  const a = getAsset(id);
  if (!a) return "/images/services/default-service.jpg";
  return preferRemote ? a.src : a.fallback;
}

export function getDefaultGalleryAssets(): ProductionAsset[] {
  return PRODUCTION_ASSETS.filter((a) =>
    [
      "hero-hospital",
      "hospital-building",
      "reception",
      "icu",
      "opd",
      "consultation",
      "diagnostics",
      "pharmacy",
      "emergency",
      "operation-theatre",
    ].includes(a.id)
  );
}

export function getHeroFallback(): ProductionAsset {
  return getAsset("hero-hospital")!;
}

export function getDoctorFallback(): ProductionAsset {
  return getAsset("doctor-profile")!;
}

export function getPatientAvatar(index: number): string {
  const ids = [1, 2, 3, 4, 5, 6];
  const n = ids[index % ids.length];
  return `/images/testimonials/patient-${n}.jpg`;
}
