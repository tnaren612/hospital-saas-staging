"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { TestimonialCarousel } from "@/components/ui/testimonial-carousel";
import {
  getFeaturedTestimonials,
  hydrateTestimonialsFromRemote,
} from "@/lib/testimonials/service";
import { useLocale } from "@/hooks/use-locale";
import type { Testimonial } from "@/types";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";

export function TestimonialsPreview() {
  const [items, setItems] = useState<Testimonial[]>(() =>
    getFeaturedTestimonials(6)
  );
  const { t } = useLocale();
  const { config } = useHospitalConfig();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/testimonials", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && Array.isArray(json.data) && json.data.length) {
          hydrateTestimonialsFromRemote(json.data as Testimonial[]);
          setItems(
            (json.data as Testimonial[])
              .filter((x) => x.featured !== false)
              .slice(0, 6)
          );
        }
      } catch {
        // keep static defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section className="bg-muted/40">
      <SectionHeader
        badge="Patient Stories"
        title={`Trusted by Families Across ${config.contact.city || "the Community"}`}
        subtitle={`Real experiences from patients who chose ${config.branding.name} for care.`}
      />
      <div className="px-1 sm:px-2">
        <TestimonialCarousel items={items} variant="preview" autoplay />
      </div>
      <div className="mt-8 text-center">
        <Link href="/testimonials">
          <Button variant="outline" className="min-h-11">
            {t.common.viewAll} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Section>
  );
}
