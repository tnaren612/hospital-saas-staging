/**
 * Dynamic site images — Gallery CMS is the single source of truth.
 * Fallback chain (never hardcode as the only path):
 *   Hospital Building → Doctor Banner → Doctor Profile → Gallery → Local photo fallback
 */

import {
  getImage,
  getImages,
  getImagesByKey,
  type CmsImage,
} from "@/lib/image-service";
import galleryJson from "@/data/gallery.json";
import { isValidImageSrc } from "@/lib/assets/image-resolve";

export type SiteImage = {
  url: string;
  alt: string;
  source: "cms" | "local" | "doctor_record";
  section?: string;
  key?: string;
  id?: string;
};

/** Local optimized photos used only when CMS has no row */
export const LOCAL_SITE_IMAGES = {
  hospitalBuilding: "/images/hospital/building.jpg",
  hospitalHero: "/images/hero/hospital-hero.jpg",
  hospitalCare: "/images/about/hospital-care.jpg",
  doctorProfile: "/images/doctors/lead-specialist.png",
  doctorBanner: "/images/doctors/lead-specialist.png",
  doctorDefault: "/images/doctors/lead-specialist.png",
  doctorGallery: [
    "/images/doctors/lead-specialist.png",
    "/images/doctors/gallery-1.jpg",
    "/images/doctors/gallery-2.jpg",
    "/images/doctors/gallery-3.jpg",
    "/images/doctors/gallery-4.jpg",
  ],
  gallery: [
    "/images/gallery/hospital-exterior.jpg",
    "/images/gallery/reception.jpg",
    "/images/gallery/icu.jpg",
    "/images/gallery/opd.jpg",
    "/images/gallery/consultation.jpg",
    "/images/gallery/diagnostics.jpg",
    "/images/gallery/operation-theatre.jpg",
    "/images/gallery/ambulance.jpg",
  ],
} as const;

function fromCms(
  img: CmsImage | null | undefined,
  altFallback: string
): SiteImage | null {
  if (!img || !isValidImageSrc(img.image_url)) return null;
  // Prefer real photos over legacy SVG placeholders in CMS
  if (img.image_url.toLowerCase().endsWith(".svg")) return null;
  return {
    url: img.image_url.trim(),
    alt: img.alt_text || img.title || altFallback,
    source: "cms",
    section: img.section,
    key: img.key,
    id: img.id,
  };
}

function local(url: string, alt: string): SiteImage {
  return { url, alt, source: "local" };
}

async function firstCms(
  candidates: Array<{ section: string; key: string }>,
  alt: string
): Promise<SiteImage | null> {
  for (const c of candidates) {
    try {
      const img = await getImage(c.section, c.key);
      const hit = fromCms(img, alt);
      if (hit) return hit;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Hospital building for About Us / about preview.
 * Priority: hospital/building → about/building → about/hospital → home/about
 * → gallery hospital category → local building photo
 */
export async function resolveHospitalBuilding(
  hospitalName = process.env.NEXT_PUBLIC_HOSPITAL_NAME || "Hospital"
): Promise<SiteImage> {
  const cms = await firstCms(
    [
      { section: "hospital", key: "building" },
      { section: "about", key: "building" },
      { section: "about", key: "hospital" },
      { section: "home", key: "about" },
      { section: "home", key: "building" },
      { section: "gallery", key: "hospital" },
      { section: "gallery", key: "building" },
    ],
    `${hospitalName} building`
  );
  if (cms) return cms;

  // Scan full gallery section for hospital exterior / building titles
  try {
    const gallery = await getImages("gallery");
    const building = gallery.find((g) => {
      const blob = `${g.key} ${g.category} ${g.title} ${g.alt_text}`.toLowerCase();
      return (
        isValidImageSrc(g.image_url) &&
        !g.image_url.toLowerCase().endsWith(".svg") &&
        (blob.includes("building") ||
          blob.includes("exterior") ||
          blob.includes("hospital") ||
          blob.includes("campus"))
      );
    });
    const hit = fromCms(building, `${hospitalName} building`);
    if (hit) return hit;
  } catch {
    // ignore
  }

  // Static gallery.json primary building image
  const staticG = (galleryJson as { src: string; alt: string; category: string }[]).find(
    (g) =>
      g.category === "hospital" ||
      g.src.includes("hospital-exterior") ||
      g.src.includes("building")
  );
  if (staticG && isValidImageSrc(staticG.src)) {
    return local(staticG.src, staticG.alt || `${hospitalName} building`);
  }

  return local(
    LOCAL_SITE_IMAGES.hospitalBuilding,
    `${hospitalName} building exterior`
  );
}

/**
 * Doctor profile + banner — shared with resolveDoctorImage().
 * Prefer doctor record photo_url (same as Doctors page) over CMS noise.
 */
export async function resolveDoctorMedia(input?: {
  photoUrl?: string | null;
  name?: string;
  slug?: string | null;
}): Promise<{ profile: SiteImage; banner: SiteImage }> {
  const { resolveDoctorImage } = await import(
    "@/lib/doctors/resolve-doctor-image"
  );
  const name = input?.name || "Doctor";

  // Load optional CMS extras (never override a valid record photo)
  const profileCms = await firstCms(
    [
      { section: "doctor", key: "profile" },
      { section: "home", key: "doctor" },
      { section: "doctors", key: "profile" },
      { section: "doctors", key: "doctor" },
    ],
    name
  );
  const bannerCms = await firstCms(
    [
      { section: "doctors", key: "banner" },
      { section: "doctor", key: "banner" },
      { section: "doctor", key: "gallery" },
    ],
    `${name} banner`
  );

  let galleryProfile: string | null = null;
  try {
    const gallery = await getImagesByKey("doctor", "gallery");
    const first = gallery.find(
      (g) =>
        isValidImageSrc(g.image_url) &&
        !g.image_url.toLowerCase().endsWith(".svg")
    );
    if (first) galleryProfile = first.image_url;
  } catch {
    /* optional */
  }

  const resolved = resolveDoctorImage({
    photoUrl: input?.photoUrl,
    bannerUrl: LOCAL_SITE_IMAGES.doctorBanner,
    profileCmsUrl: profileCms?.url,
    galleryProfileUrl: galleryProfile,
    bannerCmsUrl: bannerCms?.url,
    galleryBannerUrl: bannerCms?.url || LOCAL_SITE_IMAGES.doctorBanner,
    name,
  });

  return {
    profile: {
      url: resolved.profile,
      alt: resolved.alt,
      source:
        resolved.source === "record"
          ? "doctor_record"
          : resolved.source === "fallback"
            ? "local"
            : "cms",
    },
    banner: {
      url: resolved.banner,
      alt: `${name} banner`,
      source: bannerCms ? "cms" : "local",
    },
  };
}

/**
 * Home page slider: hospital banners + doctor banners/profiles + gallery.
 * Dynamic only — no single hardcoded path as primary source.
 */
export async function resolveHomeSliderImages(
  hospitalName = process.env.NEXT_PUBLIC_HOSPITAL_NAME || "Hospital"
): Promise<SiteImage[]> {
  const slides: SiteImage[] = [];
  const seen = new Set<string>();

  const push = (img: SiteImage | null | undefined) => {
    if (!img || !isValidImageSrc(img.url)) return;
    const key = img.url.split("?")[0];
    if (seen.has(key)) return;
    seen.add(key);
    slides.push(img);
  };

  const fetchSafe = async (fn: () => Promise<CmsImage[]>) => {
    try {
      return await fn();
    } catch {
      return [] as CmsImage[];
    }
  };

  const [
    homeHero,
    homeBanner,
    doctorsBanner,
    doctorBanner,
    doctorProfiles,
    hospitalHero,
    hospitalBuilding,
    galleryRows,
  ] = await Promise.all([
    fetchSafe(() => getImagesByKey("home", "hero")),
    fetchSafe(() => getImagesByKey("home", "banner")),
    fetchSafe(() => getImagesByKey("doctors", "banner")),
    fetchSafe(() => getImagesByKey("doctor", "banner")),
    fetchSafe(() => getImagesByKey("doctor", "profile")),
    fetchSafe(() => getImagesByKey("hospital", "hero")),
    fetchSafe(() => getImagesByKey("hospital", "building")),
    fetchSafe(() => getImages("gallery")),
  ]);

  // Hospital banners first
  for (const row of [
    ...homeHero,
    ...homeBanner,
    ...hospitalHero,
    ...hospitalBuilding,
  ]) {
    push(fromCms(row, hospitalName));
  }

  // Doctor banners & profiles
  for (const row of [...doctorsBanner, ...doctorBanner, ...doctorProfiles]) {
    push(fromCms(row, "Doctor"));
  }

  // Full gallery section
  for (const row of galleryRows) {
    push(fromCms(row, row.alt_text || hospitalName));
  }

  // Local gallery seed when CMS sparse (keeps slider premium offline)
  if (slides.length < 3) {
    push(
      local(
        LOCAL_SITE_IMAGES.hospitalHero,
        `${hospitalName} hospital banner`
      )
    );
    push(
      local(
        LOCAL_SITE_IMAGES.doctorProfile,
        "Lead specialist profile"
      )
    );
    for (const src of LOCAL_SITE_IMAGES.gallery) {
      if (slides.length >= 10) break;
      push(local(src, hospitalName));
    }
  }

  return slides;
}

/** Doctor gallery strip */
export async function resolveDoctorGallery(
  name = "Doctor"
): Promise<SiteImage[]> {
  const rows = await getImagesByKey("doctor", "gallery").catch(() => []);
  const out: SiteImage[] = [];
  for (const r of rows) {
    const hit = fromCms(r, name);
    if (hit) out.push(hit);
  }
  if (out.length === 0) {
    return LOCAL_SITE_IMAGES.doctorGallery.map((url, i) =>
      local(url, `${name} gallery ${i + 1}`)
    );
  }
  return out;
}
