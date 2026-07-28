"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wind,
  Activity,
  HeartPulse,
  Moon,
  Stethoscope,
  Video,
  Siren,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/ui/safe-image";
import { getServices } from "@/lib/data";
import { useLocale } from "@/hooks/use-locale";
import { serviceImageForId } from "@/lib/assets/image-resolve";

const iconMap: Record<string, LucideIcon> = {
  Lungs: Wind,
  Wind,
  Activity,
  HeartPulse,
  Moon,
  Stethoscope,
  Video,
  Siren,
};

const SafeIcon = ({ name }: { name: string }) => {
  const Icon = iconMap[name] || Stethoscope;
  return <Icon className="h-6 w-6" aria-hidden />;
};

export function ServicesPreview() {
  const services = getServices().slice(0, 6);
  const { t } = useLocale();

  return (
    <Section className="bg-muted/40">
      <SectionHeader
        badge="Clinical Excellence"
        title="Specialized Respiratory Services"
        subtitle="From asthma clinics to critical care — comprehensive pulmonology under one roof."
      />
      <div className="grid gap-4 min-[400px]:gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {services.map((service, i) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.06, duration: 0.45 }}
          >
            <Card className="group h-full overflow-hidden hover:-translate-y-1 hover:shadow-lift">
              {/* Always show service banner (local SVG with cascade fallback) */}
              <div className="relative h-36 overflow-hidden sm:h-40">
                <SafeImage
                  src={serviceImageForId(service.id, service.image)}
                  fallbackSrc="/images/services/default-service.jpg"
                  alt={`${service.title} service`}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  fallbackLabel={service.title}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              </div>
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 transition group-hover:scale-110 group-hover:bg-primary-600 group-hover:text-white dark:bg-primary-950">
                  <SafeIcon name={service.icon} />
                </div>
                <h3 className="text-base font-semibold sm:text-lg">
                  {service.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {service.features.slice(0, 3).map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal"
                        aria-hidden
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      <div className="mt-8 text-center sm:mt-10">
        <Link href="/services">
          <Button variant="outline" className="min-h-11">
            {t.common.viewAll} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Section>
  );
}
