"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import Image from "next/image";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { TestimonialCarousel } from "@/components/ui/testimonial-carousel";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  getPublishedTestimonials,
  hydrateTestimonialsFromRemote,
} from "@/lib/testimonials/service";
import { formatDate, cn } from "@/lib/utils";
import type { Testimonial } from "@/types";

export function TestimonialsContent() {
  const [items, setItems] = useState<Testimonial[]>(() =>
    getPublishedTestimonials()
  );
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/testimonials", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && Array.isArray(json.data) && json.data.length) {
          const rows = json.data as Testimonial[];
          hydrateTestimonialsFromRemote(rows);
          setItems(rows.filter((t) => t.published !== false));
        }
      } catch {
        // static
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const treatments = useMemo(() => {
    const set = new Set(
      items.map((t) => t.treatment || t.role).filter(Boolean)
    );
    return ["all", ...Array.from(set)];
  }, [items]);

  const filtered =
    filter === "all"
      ? items
      : items.filter((t) => (t.treatment || t.role) === filter);

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="testimonials"
        title="Testimonials"
        subtitle="Voices of patients and families who trusted us with their respiratory care."
      />
      <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: "Testimonials" }]} />
      </div>

      <Section className="bg-muted/30">
        <SectionHeader
          badge="Highlights"
          title="Stories That Inspire Us"
          subtitle="Swipe or use the arrows to browse patient experiences."
        />
        <div className="px-1 sm:px-2">
          <TestimonialCarousel items={items} variant="full" autoplay />
        </div>
      </Section>

      <Section>
        <SectionHeader
          badge="Reviews"
          title="What Our Patients Say"
          subtitle="Authentic experiences from asthma, COPD, critical care, and telemedicine patients."
        />

        <div className="mb-8 flex flex-wrap gap-2">
          {treatments.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                "min-h-10 rounded-full border px-4 py-2 text-xs font-semibold capitalize transition touch-manipulation sm:text-sm",
                filter === t
                  ? "border-primary-600 bg-primary-600 text-white"
                  : "border-border bg-card text-muted-foreground hover:border-primary-300 hover:text-foreground"
              )}
            >
              {t === "all" ? "All treatments" : t}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-16 text-center text-sm text-muted-foreground">
            No testimonials match this filter.
          </div>
        ) : (
          <div className="grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.04, 0.24) }}
              >
                <TestimonialGridCard item={item} />
              </motion.div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function TestimonialGridCard({ item }: { item: Testimonial }) {
  const [imgError, setImgError] = useState(false);
  const initials = item.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="h-full">
      <CardContent className="p-5 sm:p-6">
        <Quote className="mb-3 h-7 w-7 text-primary-200" aria-hidden />
        <div
          className="mb-3 flex gap-0.5"
          aria-label={`${item.rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }).map((_, idx) => (
            <Star
              key={idx}
              className={cn(
                "h-4 w-4",
                idx < item.rating
                  ? "fill-gold text-gold"
                  : "fill-muted text-muted"
              )}
            />
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          “{item.content}”
        </p>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-950">
              {!imgError && item.image ? (
                <Image
                  src={item.image}
                  alt={`Photo of ${item.name}`}
                  fill
                  className="object-cover"
                  sizes="44px"
                  unoptimized={item.image.endsWith(".svg")}
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-primary-700">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{item.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {item.treatment || item.role}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-xs text-muted-foreground">
            {formatDate(item.date)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
