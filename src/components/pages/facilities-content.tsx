"use client";

import { motion } from "framer-motion";
import {
  Hospital,
  Microscope,
  DoorOpen,
  Pill,
  Ambulance,
  Sofa,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { getFacilities } from "@/lib/data";

const iconMap: Record<string, LucideIcon> = {
  Hospital,
  Microscope,
  DoorOpen,
  Pill,
  Ambulance,
  Sofa,
};

export function FacilitiesContent() {
  const facilities = getFacilities();

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="facilities"
        title="Facilities"
        subtitle="Modern infrastructure designed for safety, comfort, and clinical efficiency."
      />

      <Section>
        <SectionHeader
          badge="Infrastructure"
          title="Built for Better Care"
          subtitle="From ICU to pharmacy — every space supports seamless patient journeys."
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.map((f, i) => {
            const Icon = iconMap[f.icon] || Hospital;
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="h-full transition hover:-translate-y-1 hover:shadow-lift">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-teal text-white shadow-soft">
                      <Icon className="h-7 w-7" />
                    </div>
                    <h2 className="text-xl font-semibold">{f.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {f.description}
                    </p>
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
