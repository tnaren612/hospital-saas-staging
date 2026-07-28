"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Phone,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { useLocale } from "@/hooks/use-locale";
import { getHospital, WHATSAPP_MESSAGE } from "@/lib/data";
import { getTelUrl, getWhatsAppUrl } from "@/lib/utils";

export function Hero() {
  const { t } = useLocale();
  const hospital = getHospital();
  const whatsapp = getWhatsAppUrl(hospital.whatsapp, WHATSAPP_MESSAGE);

  const stats = [
    { label: t.hero.patients, value: 12000, suffix: "+" },
    { label: t.hero.experience, value: 15, suffix: "+" },
    { label: t.hero.satisfaction, value: 98, suffix: "%" },
    { label: t.hero.emergency247, value: 24, suffix: "×7" },
  ];

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="absolute inset-0 bg-mesh opacity-40" />
      <div className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-teal/30 blur-3xl" />
      <div className="absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-primary-400/20 blur-3xl" />

      <div className="container relative mx-auto grid items-center gap-8 px-4 py-12 sm:gap-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:py-24">
        <div className="text-white">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:mb-5"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t.hero.badge}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="text-balance text-3xl font-bold leading-[1.12] tracking-tight min-[360px]:text-4xl sm:text-5xl lg:text-[3.25rem] xl:text-6xl"
          >
            {t.hero.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mt-4 max-w-xl text-sm leading-relaxed text-white/80 sm:mt-5 sm:text-base sm:text-lg"
          >
            {t.hero.subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mt-6 flex flex-col gap-3 min-[400px]:flex-row min-[400px]:flex-wrap sm:mt-8"
          >
            <Link href="/appointment" className="w-full min-[400px]:w-auto">
              <Button
                size="lg"
                className="w-full min-h-12 bg-white text-primary-800 hover:bg-white/90 min-[400px]:w-auto"
              >
                <CalendarCheck className="h-5 w-5" />
                {t.common.bookAppointment}
              </Button>
            </Link>
            <a
              href={getTelUrl(hospital.emergencyPhone)}
              className="w-full min-[400px]:w-auto"
            >
              <Button
                size="lg"
                variant="emergency"
                className="w-full min-h-12 min-[400px]:w-auto"
              >
                <Phone className="h-5 w-5" />
                {t.common.emergencyCall}
              </Button>
            </a>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-[400px]:w-auto"
            >
              <Button
                size="lg"
                variant="whatsapp"
                className="w-full min-h-12 min-[400px]:w-auto"
              >
                <MessageCircle className="h-5 w-5" />
                {t.common.whatsapp}
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25 }}
            className="mt-8 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-4 sm:gap-4"
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:p-4"
              >
                <div className="text-xl font-bold sm:text-2xl lg:text-3xl">
                  <AnimatedCounter value={s.value} suffix={s.suffix} />
                </div>
                <div className="mt-1 text-[11px] leading-snug text-white/70 sm:text-xs sm:text-sm">
                  {s.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative mx-auto w-full max-w-xl lg:max-w-none"
        >
          {/* CMS: section=home key=hero — multi-image carousel */}
          <HeroCarousel hospitalName={hospital.name} />

          {/* Floating specialty card — hide on very small screens to reduce clutter */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -bottom-3 -left-2 z-20 hidden max-w-[200px] rounded-2xl border border-white/25 bg-white/95 p-3 text-foreground shadow-lift backdrop-blur sm:block sm:max-w-[220px] sm:p-4 dark:bg-card/95 md:-left-4 md:-bottom-4"
          >
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950">
              <Stethoscope className="h-5 w-5" aria-hidden />
            </div>
            <div className="text-sm font-semibold">Specialist Pulmonology</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Asthma · COPD · Critical Care · Sleep Medicine
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
