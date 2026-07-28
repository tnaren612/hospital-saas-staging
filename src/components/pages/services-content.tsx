"use client";

import { motion } from "framer-motion";
import {
  Wind,
  Activity,
  HeartPulse,
  Moon,
  Stethoscope,
  Video,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { getServices } from "@/lib/data";

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

export function ServicesContent() {
  const services = getServices();

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="services"
        title="Our Services"
        subtitle="Comprehensive respiratory medicine and critical care services designed around patient comfort, clinical accuracy, and modern technology."
      />

      <Section>
        <SectionHeader
          badge="Clinical Services"
          title="Specialized Care Pathways"
          subtitle="Each service is delivered with specialist expertise and clear treatment pathways."
        />
        <div className="grid gap-6 md:grid-cols-2">
          {services.map((service, i) => {
            const Icon = iconMap[service.icon] || Stethoscope;
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="group h-full overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row">
                      <div className="flex items-center justify-center bg-gradient-to-br from-primary-600 to-teal p-8 text-white sm:w-40">
                        <Icon className="h-12 w-12 transition group-hover:scale-110" />
                      </div>
                      <div className="flex-1 p-6">
                        <h2 className="text-xl font-semibold">{service.title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {service.description}
                        </p>
                        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                          {service.features.map((f) => (
                            <li
                              key={f}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
