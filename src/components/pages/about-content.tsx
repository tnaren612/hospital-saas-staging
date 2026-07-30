"use client";

import { motion } from "framer-motion";
import { Heart, Target, Users, ShieldCheck } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { SafeImage } from "@/components/ui/safe-image";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { getHospital } from "@/lib/data";
import { useHospitalBuildingImage } from "@/hooks/use-site-images";
import { LOCAL_SITE_IMAGES } from "@/lib/gallery/site-images";

const values = [
  {
    icon: Heart,
    title: "Compassionate Care",
    desc: "Every patient is treated with dignity, empathy, and personalized attention.",
  },
  {
    icon: Target,
    title: "Clinical Excellence",
    desc: "Evidence-based pulmonology and critical care aligned with modern standards.",
  },
  {
    icon: Users,
    title: "Community First",
    desc: "Serving local communities with accessible specialist care.",
  },
  {
    icon: ShieldCheck,
    title: "Safety & Trust",
    desc: "Clean facilities, transparent communication, and ethical medical practice.",
  },
];

export function AboutContent() {
  const hospital = getHospital();
  const building = useHospitalBuildingImage(hospital.name);

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="about"
        title={hospital.name}
        subtitle={`A center of excellence in ${hospital.address.city || "the community"}, dedicated to helping people live healthier.`}
      />

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-lift">
            <SafeImage
              src={building.url}
              fallbackSrc={LOCAL_SITE_IMAGES.hospitalBuilding}
              alt={building.alt}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              fallbackLabel={hospital.name}
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold">Our Story</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              {hospital.name} was established to bring specialist pulmonology and
              high-quality critical care closer to local communities. Under
              experienced clinical leadership, the hospital combines academic
              rigor with warm, patient-first service.
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              From asthma and COPD clinics to emergency respiratory care and video
              consultations, we deliver modern healthcare without compromising on
              compassion or accessibility.
            </p>
            <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5 text-sm">
              <div className="font-semibold">{hospital.address.line1}</div>
              <div className="text-muted-foreground">
                {hospital.address.line2}, {hospital.address.city},{" "}
                {hospital.address.state} {hospital.address.pincode},{" "}
                {hospital.address.country}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section className="bg-muted/40">
        <SectionHeader
          badge="What We Stand For"
          title="Mission, Vision & Values"
          subtitle="Guiding principles behind every consultation, procedure, and emergency response."
        />
        <div className="mb-10 grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold">Mission</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                To provide accessible, evidence-based respiratory and critical care
                that improves outcomes and quality of life for every patient we serve.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold">Vision</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                To be the most trusted pulmonology and critical care destination in
                the region — known for excellence, empathy, and innovation.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v, i) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950">
                    <v.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{v.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{v.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>
    </div>
  );
}
