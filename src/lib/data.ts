/**
 * Data access layer.
 * Currently reads from static JSON + localStorage CMS overrides.
 * Swap implementations here when connecting a real backend.
 */

import hospitalJson from "@/data/hospital.json";
import doctorJson from "@/data/doctor.json";
import servicesJson from "@/data/services.json";
import facilitiesJson from "@/data/facilities.json";
import testimonialsJson from "@/data/testimonials.json";
import insuranceJson from "@/data/insurance.json";
import packagesJson from "@/data/packages.json";
import faqJson from "@/data/faq.json";
import slotsJson from "@/data/slots.json";
import analyticsJson from "@/data/analytics.json";
import imagesJson from "@/data/images.json";

import type {
  AnalyticsPoint,
  DoctorProfile,
  Facility,
  FAQItem,
  HealthPackage,
  HospitalInfo,
  InsurancePartner,
  Service,
  Testimonial,
  TimePeriod,
} from "@/types";
import { getStoredDoctor } from "@/lib/storage";

export function getHospital(): HospitalInfo {
  return hospitalJson as HospitalInfo;
}

function isUsablePhoto(src?: string | null): src is string {
  if (!src || typeof src !== "string") return false;
  const s = src.trim();
  if (!s.startsWith("/") && !/^https?:\/\//i.test(s)) return false;
  if (s.toLowerCase().endsWith(".svg")) return false;
  return true;
}

export function getDoctor(): DoctorProfile {
  const base = doctorJson as DoctorProfile;
  let doctor = base;

  if (typeof window !== "undefined") {
    const stored = getStoredDoctor();
    if (stored) {
      doctor = { ...base, ...stored };
    }
  }

  // Always keep core Lead Specialist identity from doctor.json when CMS blank
  if (!doctor.name?.trim()) {
    doctor = { ...doctor, name: base.name };
  }
  if (!doctor.title?.trim()) {
    doctor = {
      ...doctor,
      title:
        base.title ||
        "Consultant Pulmonologist & Critical Care Specialist",
    };
  }
  // Never serve a blank/SVG doctor photo on Home Lead Specialist
  if (!isUsablePhoto(doctor.image)) {
    doctor = {
      ...doctor,
      image:
        doctor.gallery?.find((g) => isUsablePhoto(g)) ||
        base.image ||
        "/images/doctors/lead-specialist.png",
    };
  }
  if (!isUsablePhoto(doctor.banner)) {
    doctor = {
      ...doctor,
      banner: base.banner || "/images/doctors/banner.jpg",
    };
  }
  if (!doctor.gallery?.length) {
    doctor = { ...doctor, gallery: base.gallery || [] };
  }

  return doctor;
}

export function getServices(): Service[] {
  return servicesJson as Service[];
}

export function getFacilities(): Facility[] {
  return facilitiesJson as Facility[];
}

export function getTestimonials(): Testimonial[] {
  // Prefer CMS-aware service when available (client); static JSON on server
  try {
    // Dynamic require avoided — re-export shape for server components
    return (testimonialsJson as Testimonial[]).filter(
      (t) => t.published !== false
    );
  } catch {
    return testimonialsJson as Testimonial[];
  }
}

export function getInsurance(): InsurancePartner[] {
  return insuranceJson as InsurancePartner[];
}

export function getPackages(): HealthPackage[] {
  return packagesJson as HealthPackage[];
}

export function getFaqs(): FAQItem[] {
  return faqJson as FAQItem[];
}

export function getSlots(): Record<TimePeriod, string[]> {
  return slotsJson as Record<TimePeriod, string[]>;
}

export function getAnalytics(): {
  weekly: AnalyticsPoint[];
  monthly: AnalyticsPoint[];
  yearly: AnalyticsPoint[];
  serviceMix: { name: string; value: number }[];
} {
  return analyticsJson as {
    weekly: AnalyticsPoint[];
    monthly: AnalyticsPoint[];
    yearly: AnalyticsPoint[];
    serviceMix: { name: string; value: number }[];
  };
}

export function getImagePaths() {
  return imagesJson;
}

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://srisrinivasahospital.com";

export const WHATSAPP_MESSAGE =
  "Hello Doctor,\n\nI would like to book an appointment.";
