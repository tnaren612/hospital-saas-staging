"use client";

import Link from "next/link";
import {
  Award,
  Briefcase,
  ChevronRight,
  Clock,
  GraduationCap,
  Languages,
  Stethoscope,
  Video,
} from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { SafeImage } from "@/components/ui/safe-image";
import {
  isDoctorAvailableToday,
  type PublicDoctor,
} from "@/lib/doctors/service";
import { formatCurrency } from "@/lib/utils";
import { useDoctorGalleryImages } from "@/hooks/use-site-images";
import {
  DOCTOR_BANNER,
  DOCTOR_BANNER_FALLBACK,
  DOCTOR_GALLERY_DEFAULTS,
  DOCTOR_IMAGE_FALLBACK,
  resolveDoctorImage,
} from "@/lib/doctors/resolve-doctor-image";

export function DoctorProfileContent({
  doctor,
  related,
}: {
  doctor: PublicDoctor;
  related: PublicDoctor[];
}) {
  // doctor/banner + profile — same as Home Lead Specialist
  const media = resolveDoctorImage({
    photoUrl: doctor.photo_url,
    bannerUrl: DOCTOR_BANNER,
    gallery: [...DOCTOR_GALLERY_DEFAULTS],
    galleryProfileUrl: DOCTOR_GALLERY_DEFAULTS[0],
    name: doctor.name,
  });
  const profileSrc = media.profile || DOCTOR_IMAGE_FALLBACK;
  const bannerSrc = media.banner || DOCTOR_BANNER_FALLBACK;
  const galleryCms = useDoctorGalleryImages(doctor.name);
  const online = isDoctorAvailableToday(doctor);
  const gallery =
    galleryCms.images.length > 0
      ? galleryCms.images.map((i) => i.url)
      : media.gallery;

  const degrees =
    doctor.degrees?.length ? doctor.degrees : doctor.qualifications;

  return (
    <div className="page-enter">
      {/* Breadcrumbs */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto flex flex-wrap items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/doctors" className="hover:text-foreground">
            Doctors
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">{doctor.name}</span>
        </div>
      </div>

      {/* Hero — doctor/banner image */}
      <section className="relative overflow-hidden bg-hero-gradient py-14 text-white md:py-20">
        <div className="absolute inset-0">
          <Image
            src={bannerSrc}
            alt=""
            fill
            className="object-cover object-center"
            priority
            sizes="100vw"
            aria-hidden
          />
        </div>
        <div className="absolute inset-0 bg-primary-950/75" />
        <div className="container relative mx-auto grid items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              {doctor.department_name ? (
                <Badge className="bg-white/15 text-white hover:bg-white/20">
                  {doctor.department_name}
                </Badge>
              ) : null}
              <Badge
                className={
                  online
                    ? "bg-emerald-500/90 text-white"
                    : "bg-white/15 text-white"
                }
              >
                {online ? "Available today" : "By appointment"}
              </Badge>
              {doctor.is_featured ? (
                <Badge className="bg-amber-400/90 text-amber-950">Featured</Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-bold md:text-5xl">{doctor.name}</h1>
            <p className="mt-3 text-lg text-white/80">{doctor.title}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {degrees.map((q) => (
                <span
                  key={q}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-medium"
                >
                  {q}
                </span>
              ))}
            </div>
            {doctor.experience_years ? (
              <p className="mt-3 text-sm text-white/80">
                {doctor.experience_years}+ years experience
              </p>
            ) : null}
            {doctor.consultation_timings ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-white/80">
                <Clock className="h-4 w-4" aria-hidden />
                {doctor.consultation_timings}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`}
              >
                <Button
                  size="lg"
                  className="min-h-12 bg-white text-primary-800 hover:bg-white/90"
                >
                  Book Appointment
                </Button>
              </Link>
              <Link href="/video-consult">
                <Button size="lg" variant="glass" className="min-h-12">
                  <Video className="h-4 w-4" aria-hidden />
                  Video Consult
                  {doctor.video_consultation_fee
                    ? ` · ${formatCurrency(doctor.video_consultation_fee)}`
                    : ""}
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] border border-white/20 bg-muted shadow-lift">
            <Image
              src={profileSrc}
              alt={`Profile photo of ${doctor.name}`}
              fill
              priority
              className="object-cover object-top"
              sizes="(max-width: 768px) 100vw, 40vw"
            />
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-10">
            <div>
              <h2 className="text-2xl font-bold">Professional Profile</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {doctor.biography ||
                  `${doctor.name} is a specialist consultant at Sri Srinivasa Hospital.`}
              </p>
            </div>

            {(doctor.experience_timeline?.length ||
              doctor.experience_notes) && (
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                  <Briefcase className="h-5 w-5 text-primary-600" />
                  Experience Timeline
                </h3>
                <ul className="space-y-3">
                  {(doctor.experience_timeline || []).map((item) => (
                    <li
                      key={item}
                      className="relative border-l-2 border-primary-200 pl-4 text-muted-foreground dark:border-primary-800"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                {doctor.experience_notes ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {doctor.experience_notes}
                  </p>
                ) : null}
              </div>
            )}

            {doctor.treatments?.length ? (
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                  <Stethoscope className="h-5 w-5 text-primary-600" />
                  Treatments
                </h3>
                <div className="flex flex-wrap gap-2">
                  {doctor.treatments.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {doctor.services?.length ? (
              <div>
                <h3 className="mb-4 text-xl font-semibold">Services</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {doctor.services.map((s) => (
                    <li
                      key={s}
                      className="rounded-xl border bg-card px-4 py-3 text-sm"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {gallery.length > 0 && (
              <div>
                <h3 className="mb-4 text-xl font-semibold">Gallery</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {gallery.map((src, i) => (
                    <div
                      key={`${src}-${i}`}
                      className="relative aspect-square overflow-hidden rounded-2xl"
                    >
                      <SafeImage
                        src={src}
                        fallbackSrc={DOCTOR_IMAGE_FALLBACK}
                        alt={`${doctor.name} gallery ${i + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 33vw"
                        fallbackLabel="Gallery"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {doctor.video_intro_url ? (
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                  <Video className="h-5 w-5 text-primary-600" />
                  Video Introduction
                </h3>
                <a
                  href={doctor.video_intro_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary-700 underline dark:text-primary-300"
                >
                  Watch introduction
                </a>
              </div>
            ) : null}

            {doctor.faqs && doctor.faqs.length > 0 ? (
              <div>
                <h3 className="mb-4 text-xl font-semibold">FAQs</h3>
                <div className="space-y-3">
                  {doctor.faqs.map((f) => (
                    <Card key={f.question}>
                      <CardContent className="p-4">
                        <p className="font-medium">{f.question}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {f.answer}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardContent className="space-y-4 p-5">
                <h3 className="font-semibold">Consultation</h3>
                <div className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                  {formatCurrency(doctor.consultation_fee || 0)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    OPD
                  </span>
                </div>
                {doctor.video_consultation_fee != null ? (
                  <p className="text-sm text-muted-foreground">
                    Video: {formatCurrency(doctor.video_consultation_fee)}
                  </p>
                ) : null}
                <Link
                  href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`}
                >
                  <Button className="w-full">Book Appointment</Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-5 text-sm">
                <div className="flex items-start gap-2">
                  <GraduationCap className="mt-0.5 h-4 w-4 text-primary-600" />
                  <div>
                    <p className="font-medium">Qualifications</p>
                    <p className="text-muted-foreground">
                      {(doctor.qualifications || []).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Languages className="mt-0.5 h-4 w-4 text-primary-600" />
                  <div>
                    <p className="font-medium">Languages</p>
                    <p className="text-muted-foreground">
                      {(doctor.languages || []).join(", ") || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Award className="mt-0.5 h-4 w-4 text-primary-600" />
                  <div>
                    <p className="font-medium">Awards</p>
                    <p className="text-muted-foreground">
                      {(doctor.awards || []).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                {(doctor.memberships || []).length > 0 && (
                  <div>
                    <p className="font-medium">Memberships</p>
                    <p className="text-muted-foreground">
                      {doctor.memberships!.join(" · ")}
                    </p>
                  </div>
                )}
                {(doctor.certifications || []).length > 0 && (
                  <div>
                    <p className="font-medium">Certifications</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                      {doctor.certifications!.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </Section>

      {related.length > 0 && (
        <Section className="bg-muted/30">
          <h2 className="mb-6 text-2xl font-bold">Related Doctors</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.id} href={`/doctors/${r.slug || r.id}`}>
                <Card className="h-full transition hover:shadow-lift">
                  <CardContent className="flex gap-3 p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                      <Image
                        src={
                          resolveDoctorImage({
                            photoUrl: r.photo_url,
                            gallery: [...DOCTOR_GALLERY_DEFAULTS],
                            galleryProfileUrl: DOCTOR_GALLERY_DEFAULTS[0],
                            name: r.name,
                          }).profile
                        }
                        alt={r.name}
                        fill
                        className="object-cover object-top"
                        sizes="64px"
                      />
                    </div>
                    <div>
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.title}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
