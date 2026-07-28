"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2,
  Shield,
  Package,
  Camera,
  HelpCircle,
  Video,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";

const items = [
  {
    href: "/facilities",
    title: "World-Class Facilities",
    desc: "ICU, diagnostics, pharmacy, and ambulance support.",
    icon: Building2,
  },
  {
    href: "/insurance",
    title: "Insurance Partners",
    desc: "Cashless facilitation with leading health insurers.",
    icon: Shield,
  },
  {
    href: "/health-packages",
    title: "Health Packages",
    desc: "Affordable lung screening and recovery packages.",
    icon: Package,
  },
  {
    href: "/gallery",
    title: "Hospital Gallery",
    desc: "A look inside our care spaces and infrastructure.",
    icon: Camera,
  },
  {
    href: "/video-consult",
    title: "Video Consultation",
    desc: "Secure telemedicine with demo meeting room.",
    icon: Video,
  },
  {
    href: "/faq",
    title: "FAQs",
    desc: "Answers on timings, fees, appointments, and more.",
    icon: HelpCircle,
  },
];

export function HomeExtras() {
  return (
    <Section>
      <SectionHeader
        badge="Explore"
        title="Everything You Need in One Place"
        subtitle="Appointments, insurance, packages, telemedicine, and transparent hospital information."
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
          >
            <Link href={item.href}>
              <Card className="h-full transition hover:-translate-y-1 hover:border-primary-300 hover:shadow-lift">
                <CardContent className="flex gap-4 p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
