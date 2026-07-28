"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Award,
  GraduationCap,
  Briefcase,
  Languages,
  Star,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/ui/safe-image";
import { getDoctor } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import {
  DOCTOR_BANNER,
  DOCTOR_BANNER_FALLBACK,
  DOCTOR_IMAGE_FALLBACK,
  resolveDoctorImage,
} from "@/lib/doctors/resolve-doctor-image";

/**
 * Legacy /doctor route — doctor/banner + profile (same as Home Lead Specialist).
 */
export function DoctorContent() {
  const doctor = getDoctor();
  const { t } = useLocale();

  const media = resolveDoctorImage({
    photoUrl: doctor.image,
    bannerUrl: doctor.banner || DOCTOR_BANNER,
    gallery: doctor.gallery,
    galleryProfileUrl: doctor.gallery?.[0],
    name: doctor.name,
  });
  const profileSrc = media.profile || DOCTOR_IMAGE_FALLBACK;
  const bannerSrc = media.banner || DOCTOR_BANNER_FALLBACK;

  return (
    <div className="page-enter">
      <section className="relative overflow-hidden bg-hero-gradient py-16 text-white md:py-20">
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
            <Badge className="mb-4 bg-white/15 text-white hover:bg-white/20">
              Consultant Pulmonologist
            </Badge>
            <h1 className="text-3xl font-bold md:text-5xl">{doctor.name}</h1>
            <p className="mt-3 text-lg text-white/80">{doctor.title}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {doctor.qualifications.map((q) => (
                <span
                  key={q}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-medium"
                >
                  {q}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/appointment">
                <Button
                  size="lg"
                  className="min-h-12 bg-white text-primary-800 hover:bg-white/90"
                >
                  {t.common.bookAppointment}
                </Button>
              </Link>
              <Link href="/video-consult">
                <Button size="lg" variant="glass" className="min-h-12">
                  Video Consultation ·{" "}
                  {formatCurrency(doctor.videoConsultationFee)}
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
        <div className="grid gap-8 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2"
          >
            <SectionHeader badge="About" title="Clinical Profile" />
            <p className="mt-4 leading-relaxed text-muted-foreground">
              {doctor.bio}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {doctor.experience.map((e) => (
                <Card key={e}>
                  <CardContent className="flex gap-3 p-4">
                    <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                    <p className="text-sm font-medium">{e}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <GraduationCap className="h-5 w-5 text-primary-600" />
                  Qualifications
                </div>
                <div className="flex flex-wrap gap-2">
                  {doctor.qualifications.map((q) => (
                    <Badge key={q} variant="secondary">
                      {q}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <Award className="h-5 w-5 text-gold" />
                  Awards
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {doctor.awards.map((a) => (
                    <li key={a} className="flex gap-2">
                      <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                      {a}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <Languages className="h-5 w-5 text-primary-600" />
                  Languages
                </div>
                <p className="text-sm text-muted-foreground">
                  {doctor.languages?.join(", ") || "English, Telugu"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader badge="Specializations" title="Areas of Expertise" />
        <div className="flex flex-wrap justify-center gap-3">
          {doctor.specializations.map((s) => (
            <Badge key={s} variant="outline" className="px-4 py-2 text-sm">
              {s}
            </Badge>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeader badge="Gallery" title="Photo Gallery" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {media.gallery.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="relative aspect-square overflow-hidden rounded-2xl shadow-soft"
            >
              <SafeImage
                src={src}
                fallbackSrc={DOCTOR_IMAGE_FALLBACK}
                alt={`${doctor.name} gallery ${i + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, 25vw"
                fallbackLabel={`Gallery ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
