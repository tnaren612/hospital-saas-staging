"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarCheck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { getHospital } from "@/lib/data";
import { getTelUrl } from "@/lib/utils";

export function CtaBanner() {
  const { t } = useLocale();
  const hospital = getHospital();

  return (
    <SectionLike>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-[1.5rem] bg-hero-gradient px-5 py-10 text-center text-white shadow-lift sm:rounded-[2rem] sm:px-8 sm:py-12 md:px-16 md:py-16"
      >
        <div className="pointer-events-none absolute inset-0 bg-mesh opacity-40" />
        <div className="relative">
          <h2 className="text-balance text-2xl font-bold sm:text-3xl md:text-4xl">
            Ready to take the next step for your lung health?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/80 sm:mt-4 sm:text-base">
            Book a consultation with our pulmonologist or call our emergency line
            for urgent respiratory care — available 24×7.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center sm:mt-8">
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
          </div>
        </div>
      </motion.div>
    </SectionLike>
  );
}

function SectionLike({ children }: { children: React.ReactNode }) {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
