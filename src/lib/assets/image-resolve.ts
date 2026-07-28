/**
 * Image URL resolution helpers.
 * Prefer valid local/public photo assets; CMS/remote only when usable.
 */

const LOCAL_DEFAULTS = {
  doctor: "/images/doctors/lead-specialist.png",
  doctorAlt: "/images/doctors/lead-specialist.png",
  service: "/images/services/default-service.jpg",
  serviceAlt: "/images/services/pulmonology.jpg",
  gallery: "/images/gallery/hospital-exterior.jpg",
  avatar: "/images/testimonials/patient-1.jpg",
  hospital: "/images/hero/hospital-hero.jpg",
} as const;

/** True when URL is non-empty and usable for next/image or <img>. */
export function isValidImageSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  const s = src.trim();
  if (!s) return false;
  if (s === "undefined" || s === "null") return false;
  if (s.startsWith("/") && s.length > 1) return true;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return Boolean(u.hostname);
    } catch {
      return false;
    }
  }
  if (s.startsWith("data:") || s.startsWith("blob:")) return true;
  return false;
}

/** Prefer photos over legacy SVG placeholders when both present. */
export function preferPhotoOverSvg(
  primary: string | null | undefined,
  photoFallback: string
): string {
  if (!isValidImageSrc(primary)) return photoFallback;
  const p = primary.trim();
  // Upgrade known SVG placeholders to local photos
  if (p.toLowerCase().endsWith(".svg") && isValidImageSrc(photoFallback)) {
    return photoFallback;
  }
  return p;
}

/** First valid candidate, else fallback. */
export function resolveImageSrc(
  candidates: Array<string | null | undefined>,
  fallback: string
): string {
  for (const c of candidates) {
    if (isValidImageSrc(c)) {
      const s = c.trim();
      // Skip empty-looking SVG placeholders when photo fallback exists
      if (s.toLowerCase().endsWith(".svg") && fallback && !fallback.endsWith(".svg")) {
        continue;
      }
      return s;
    }
  }
  return fallback;
}

export function defaultDoctorImage(): string {
  return LOCAL_DEFAULTS.doctor;
}

export function defaultServiceImage(): string {
  return LOCAL_DEFAULTS.service;
}

export function defaultGalleryImage(): string {
  return LOCAL_DEFAULTS.gallery;
}

/** Map service id → local photo asset (never blank). */
export function serviceImageForId(id: string, configured?: string): string {
  const map: Record<string, string> = {
    pulmonology: "/images/services/pulmonology.jpg",
    "asthma-care": "/images/services/asthma.jpg",
    asthma: "/images/services/asthma.jpg",
    copd: "/images/services/copd.jpg",
    "critical-care": "/images/services/critical-care.jpg",
    "sleep-medicine": "/images/services/sleep.jpg",
    sleep: "/images/services/sleep.jpg",
    "respiratory-medicine": "/images/services/respiratory.jpg",
    respiratory: "/images/services/respiratory.jpg",
    "video-consult": "/images/services/video.jpg",
    emergency: "/images/services/emergency.jpg",
  };
  const mapped = map[id] || LOCAL_DEFAULTS.service;
  if (isValidImageSrc(configured) && !configured!.toLowerCase().endsWith(".svg")) {
    return configured!.trim();
  }
  // If configured is SVG or empty, use mapped photo
  return mapped;
}

export { LOCAL_DEFAULTS };
