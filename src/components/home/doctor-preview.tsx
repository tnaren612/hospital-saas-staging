"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, GraduationCap, ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDoctor } from "@/lib/data";
import { useLocale } from "@/hooks/use-locale";

/**
 * Shared gallery doctor photo — same as Doctors listing (fallbackDoctor.photo_url).
 * Uploaded asset: public/images/doctors/lead-specialist.png
 */
const DOCTOR_GALLERY_PHOTO = "/images/doctors/lead-specialist.png";
const DOCTOR_PHOTO_FALLBACKS = [
  "/images/doctors/lead-specialist.png",
  "/images/doctors/doctor-profile.png",
  "/images/doctors/lead-specialist.jpg",
  "/images/doctors/gallery-1.jpg",
  "/images/doctors/default-doctor.jpg",
] as const;

/**
 * Home — Lead Specialist (DoctorPreview)
 * doctor.image from doctor.json → /images/doctors/lead-specialist.png
 */
export function DoctorPreview() {
  const doctor = getDoctor();
  const { t } = useLocale();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prefer doctor.json image (gallery lead-specialist), then fixed gallery path
  const fromJson =
    doctor.image &&
    !doctor.image.toLowerCase().endsWith(".svg") &&
    doctor.image.startsWith("/")
      ? doctor.image
      : null;

  const fromGallery =
    doctor.gallery?.find(
      (g) => g && !g.toLowerCase().endsWith(".svg") && g.startsWith("/")
    ) || null;

  const chain = [
    fromJson || DOCTOR_GALLERY_PHOTO,
    fromGallery,
    ...DOCTOR_PHOTO_FALLBACKS,
  ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);

  const photo = chain[Math.min(photoIndex, chain.length - 1)];
  const name = doctor.name || "Dr. Varaprasad Venkata Sumanth";
  const title =
    doctor.title?.trim() ||
    "Consultant Pulmonologist & Critical Care Specialist";

  return (
    <Section id="lead-specialist">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-none">
          <div
            className="relative overflow-hidden rounded-[1.5rem] bg-slate-200 shadow-lift sm:rounded-[2rem]"
            style={{
              width: "100%",
              height: 420,
              maxWidth: 420,
            }}
          >
            {mounted ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={`${name}, ${title}`}
                width={420}
                height={420}
                decoding="async"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "top center",
                  display: "block",
                }}
                onError={() => {
                  setPhotoIndex((i) => (i + 1 < chain.length ? i + 1 : i));
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-slate-200" aria-hidden />
            )}
          </div>

          <div className="absolute -bottom-4 right-2 z-20 rounded-2xl border border-border bg-card p-3 shadow-soft sm:-bottom-5 sm:right-6 sm:p-4">
            <div className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
              <Award className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              Ex Consultant · Ex Assistant Professor
            </div>
          </div>
        </div>

        <div>
          <Badge variant="teal" className="mb-3">
            Lead Specialist
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {name}
          </h2>
          <p className="mt-2 text-base font-medium text-primary-700 dark:text-primary-300 md:text-lg">
            {title}
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {[
              doctor.specializations?.includes("Pulmonology")
                ? "Pulmonology"
                : null,
              doctor.specializations?.includes("Critical Care")
                ? "Critical Care"
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Pulmonology · Critical Care"}
          </p>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            {(doctor.bio || "").slice(0, 280)}
            {doctor.bio && doctor.bio.length > 280 ? "…" : ""}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {(doctor.qualifications || []).map((q) => (
              <Badge key={q} variant="secondary" className="gap-1">
                <GraduationCap className="h-3 w-3" aria-hidden />
                {q}
              </Badge>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {(doctor.specializations || []).map((s) => (
              <span
                key={s}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/doctors">
              <Button>
                {t.common.learnMore} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/appointment">
              <Button variant="outline">{t.common.bookAppointment}</Button>
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
