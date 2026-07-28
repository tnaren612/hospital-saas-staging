"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, HeartPulse, ShieldCheck, Users } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SafeImage } from "@/components/ui/safe-image";
import { getHospital } from "@/lib/data";
import { useHospitalBuildingImage } from "@/hooks/use-site-images";
import { LOCAL_SITE_IMAGES } from "@/lib/gallery/site-images";

const pillars = [
  {
    icon: HeartPulse,
    title: "Patient-first care",
    desc: "Evidence-based pulmonology with clear communication at every step.",
  },
  {
    icon: ShieldCheck,
    title: "Modern critical care",
    desc: "ICU readiness, diagnostics, and emergency respiratory support 24×7.",
  },
  {
    icon: Users,
    title: "Community trust",
    desc: "Serving Badvel families with specialist access close to home.",
  },
];

export function AboutPreview() {
  const hospital = getHospital();
  const building = useHospitalBuildingImage(hospital.name);

  return (
    <Section>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="relative hidden md:block"
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-lift">
            {building.loading ? (
              <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
            ) : (
              <SafeImage
                src={building.url}
                fallbackSrc={LOCAL_SITE_IMAGES.hospitalBuilding}
                alt={building.alt}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 0px, 50vw"
                fallbackLabel={hospital.name}
              />
            )}
          </div>
          <div className="absolute -bottom-4 -right-2 max-w-[200px] rounded-2xl border border-border bg-card p-4 shadow-soft sm:right-4">
            <div className="text-2xl font-bold text-primary-700 dark:text-primary-300">
              15+
            </div>
            <div className="text-xs text-muted-foreground">
              Years of specialist respiratory medicine
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="teal" className="mb-3">
            About us
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Premium respiratory care in the heart of Badvel
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            {hospital.name} combines specialist pulmonology, critical care, and
            compassionate bedside practice — so you never have to travel far for
            world-class lung health support.
          </p>

          <ul className="mt-8 space-y-4">
            {pillars.map((p) => (
              <li key={p.title} className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950">
                  <p.icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/about">
              <Button>
                Our story <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/facilities">
              <Button variant="outline">View facilities</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
