/**
 * Single shared doctor image resolver.
 * Home Lead Specialist, Doctors list, Featured cards, and Doctor detail MUST use this.
 *
 * Banner (wide):  doctor/banner → CMS banner → gallery → profile
 * Profile (portrait): gallery → photo_url → CMS profile → banner → fallback
 */

import { isValidImageSrc } from "@/lib/assets/image-resolve";

/** Doctor banner — Doctor page hero */
export const DOCTOR_BANNER = "/images/doctors/banner.jpg";
/**
 * Shared gallery doctor portrait for Home DoctorPreview + Doctors listing.
 * doctor.image / fallbackDoctor.photo_url → lead-specialist.png (uploaded)
 */
export const DOCTOR_PROFILE = "/images/doctors/lead-specialist.png";
export const DOCTOR_GALLERY_PROFILE = "/images/doctors/lead-specialist.png";
export const DOCTOR_IMAGE_FALLBACK = DOCTOR_PROFILE;
export const DOCTOR_BANNER_FALLBACK = DOCTOR_PROFILE;

/** Default local gallery set for the lead specialist (1 doctor) */
export const DOCTOR_GALLERY_DEFAULTS = [
  "/images/doctors/lead-specialist.png",
  "/images/doctors/gallery-1.jpg",
  "/images/doctors/gallery-2.jpg",
  "/images/doctors/gallery-3.jpg",
  "/images/doctors/gallery-4.jpg",
] as const;

export type ResolveDoctorImageInput = {
  /** HMS photo_url or doctor.json image (portrait) */
  photoUrl?: string | null;
  /** doctor.json banner or CMS doctor/banner */
  bannerUrl?: string | null;
  /** CMS: section=doctor key=profile */
  profileCmsUrl?: string | null;
  /** Gallery first item / doctor.gallery[0] */
  galleryProfileUrl?: string | null;
  /** CMS or gallery banner */
  bannerCmsUrl?: string | null;
  galleryBannerUrl?: string | null;
  /** Full gallery list */
  gallery?: Array<string | null | undefined> | null;
  name?: string;
};

export type ResolvedDoctorImages = {
  /** Portrait — cards, profile side */
  profile: string;
  /** Wide banner — Home Lead Specialist + Doctor page hero background */
  banner: string;
  gallery: string[];
  alt: string;
  source: "gallery" | "record" | "cms_profile" | "cms_banner" | "fallback";
};

function usable(url?: string | null): string | null {
  if (!isValidImageSrc(url)) return null;
  const u = url!.trim();
  if (u.toLowerCase().endsWith(".svg")) return null;
  return u;
}

function firstFromGallery(
  gallery?: Array<string | null | undefined> | null
): string | null {
  if (!gallery?.length) return null;
  for (const item of gallery) {
    const u = usable(item);
    if (u) return u;
  }
  return null;
}

/**
 * Resolve doctor portrait + banner used across the entire site.
 */
export function resolveDoctorImage(
  input: ResolveDoctorImageInput = {}
): ResolvedDoctorImages {
  const name = input.name || "Doctor";
  const galleryFirst =
    usable(input.galleryProfileUrl) || firstFromGallery(input.gallery);
  const record = usable(input.photoUrl);
  const profileCms = usable(input.profileCmsUrl);
  const bannerExplicit =
    usable(input.bannerUrl) ||
    usable(input.galleryBannerUrl) ||
    usable(input.bannerCmsUrl);

  let profile = DOCTOR_IMAGE_FALLBACK;
  let source: ResolvedDoctorImages["source"] = "fallback";

  // Portrait priority: gallery → profile record → CMS → banner → fallback
  if (galleryFirst) {
    profile = galleryFirst;
    source = "gallery";
  } else if (record) {
    profile = record;
    source = "record";
  } else if (profileCms) {
    profile = profileCms;
    source = "cms_profile";
  } else if (bannerExplicit) {
    profile = bannerExplicit;
    source = "cms_banner";
  }

  // Banner priority: doctor/banner (explicit/CMS) → dedicated banner asset → profile
  const banner =
    bannerExplicit || DOCTOR_BANNER_FALLBACK || profile || DOCTOR_BANNER;

  const galleryList: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string | null) => {
    const v = usable(u);
    if (v && !seen.has(v)) {
      seen.add(v);
      galleryList.push(v);
    }
  };
  push(banner);
  push(profile);
  if (input.gallery) {
    for (const g of input.gallery) push(g);
  }
  for (const g of DOCTOR_GALLERY_DEFAULTS) push(g);

  return {
    profile,
    banner,
    gallery: galleryList,
    alt: name,
    source,
  };
}

/** Sync helper for components that only need the profile URL string */
export function resolveDoctorProfileUrl(
  photoUrl?: string | null,
  galleryFirst?: string | null
): string {
  return resolveDoctorImage({
    photoUrl,
    galleryProfileUrl: galleryFirst,
  }).profile;
}

/** Banner URL helper — doctor/banner first */
export function resolveDoctorBannerUrl(
  bannerUrl?: string | null,
  photoUrl?: string | null
): string {
  return resolveDoctorImage({
    bannerUrl: bannerUrl || DOCTOR_BANNER,
    photoUrl,
  }).banner;
}
