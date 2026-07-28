"use client";

import Link from "next/link";
import { Phone, MessageCircle, CalendarCheck } from "lucide-react";
import { motion } from "framer-motion";
import { getHospital, WHATSAPP_MESSAGE } from "@/lib/data";
import { getTelUrl, getWhatsAppUrl } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

export function FloatingActions() {
  const hospital = getHospital();
  const { t } = useLocale();
  const whatsappUrl = getWhatsAppUrl(hospital.whatsapp, WHATSAPP_MESSAGE);
  const tel = getTelUrl(hospital.emergencyPhone);

  return (
    <>
      {/* Sticky appointment (desktop left / mobile bottom bar companion) */}
      <motion.div
        initial={{ x: 80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="fixed bottom-4 right-3 z-40 flex flex-col items-end gap-2.5 sm:bottom-6 sm:right-6 sm:gap-3"
      >
        <Link
          href="/appointment"
          className="group flex min-h-12 items-center gap-2 rounded-full bg-primary-600 px-3.5 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-primary-700 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 touch-manipulation sm:px-4"
        >
          <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{t.common.bookAppointment}</span>
          <span className="sr-only sm:hidden">Book appointment</span>
        </Link>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition hover:scale-105 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] touch-manipulation sm:h-14 sm:w-14"
          aria-label="WhatsApp appointment"
        >
          <MessageCircle className="h-6 w-6" aria-hidden />
        </a>

        <a
          href={tel}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-emergency text-white shadow-lift transition hover:scale-105 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 touch-manipulation sm:h-14 sm:w-14"
          aria-label="Emergency call"
        >
          <Phone className="h-6 w-6" aria-hidden />
        </a>
      </motion.div>
    </>
  );
}
