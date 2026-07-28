"use client";

import { Phone, Ambulance, Siren } from "lucide-react";
import { getHospital } from "@/lib/data";
import { getTelUrl } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

export function EmergencyBanner() {
  const hospital = getHospital();
  const { t } = useLocale();
  const phone = hospital.emergencyPhone;

  return (
    <div
      className="relative z-50 bg-emergency text-white"
      role="region"
      aria-label="Emergency contact banner"
    >
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 font-semibold">
          <Siren className="h-4 w-4 animate-pulse-soft" aria-hidden />
          <span className="hidden sm:inline">{t.emergency.title}</span>
          <span className="sm:hidden">24×7 Emergency</span>
        </div>
        <p className="hidden text-white/90 md:block">{t.emergency.subtitle}</p>
        <div className="flex items-center gap-3">
          <a
            href={getTelUrl(phone)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold backdrop-blur transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Phone className="h-3.5 w-3.5" />
            {t.emergency.call}
          </a>
          <a
            href={getTelUrl(phone)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold text-emergency transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Ambulance className="h-3.5 w-3.5" />
            {t.emergency.ambulance}
          </a>
        </div>
      </div>
    </div>
  );
}
