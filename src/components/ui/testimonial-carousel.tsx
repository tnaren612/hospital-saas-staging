"use client";

import { useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation, Pagination, A11y } from "swiper/modules";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";
import type { Testimonial } from "@/types";
import { formatDate, cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

type Props = {
  items: Testimonial[];
  className?: string;
  /** Compact for homepage; full for testimonials page */
  variant?: "preview" | "full";
  autoplay?: boolean;
};

export function TestimonialCarousel({
  items,
  className,
  variant = "preview",
  autoplay = true,
}: Props) {
  const [paused, setPaused] = useState(false);

  if (!items.length) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No patient stories yet. Check back soon.
      </div>
    );
  }

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Swiper
        modules={[Autoplay, Navigation, Pagination, A11y]}
        spaceBetween={20}
        slidesPerView={1}
        grabCursor
        loop={items.length > 2}
        speed={600}
        autoplay={
          autoplay && !paused
            ? {
                delay: 5000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }
            : false
        }
        pagination={{
          clickable: true,
          el: ".testimonial-swiper-pagination",
        }}
        navigation={{
          prevEl: ".testimonial-swiper-prev",
          nextEl: ".testimonial-swiper-next",
        }}
        breakpoints={{
          640: { slidesPerView: 1.15, spaceBetween: 16 },
          768: { slidesPerView: 2, spaceBetween: 20 },
          1024: {
            slidesPerView: variant === "full" ? 3 : 3,
            spaceBetween: 24,
          },
        }}
        a11y={{
          enabled: true,
          prevSlideMessage: "Previous testimonial",
          nextSlideMessage: "Next testimonial",
        }}
        className="!pb-12"
      >
        {items.map((item) => (
          <SwiperSlide key={item.id} className="h-auto">
            <TestimonialCard item={item} />
          </SwiperSlide>
        ))}
      </Swiper>

      <button
        type="button"
        className="testimonial-swiper-prev absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft transition hover:bg-muted sm:-left-3"
        aria-label="Previous testimonial"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="testimonial-swiper-next absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft transition hover:bg-muted sm:-right-3"
        aria-label="Next testimonial"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="testimonial-swiper-pagination flex justify-center gap-1.5" />

      <CarouselStyles />
    </div>
  );
}

function TestimonialCard({ item }: { item: Testimonial }) {
  const [imgError, setImgError] = useState(false);
  const initials = item.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="h-full border-border/80 shadow-soft transition hover:shadow-lift">
      <CardContent className="flex h-full flex-col p-5 sm:p-6">
        <Quote className="mb-3 h-7 w-7 text-primary-200" aria-hidden />
        <div className="mb-3 flex gap-0.5" aria-label={`${item.rating} out of 5 stars`}>
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
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          “{item.content}”
        </p>
        <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-primary-100 ring-2 ring-primary-100 dark:bg-primary-950 dark:ring-primary-900">
            {!imgError && item.image ? (
              <Image
                src={item.image}
                alt={`Photo of ${item.name}`}
                fill
                className="object-cover"
                sizes="48px"
                unoptimized={item.image.endsWith(".svg") || /^https?:\/\//i.test(item.image)}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-primary-700">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-foreground">{item.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {item.treatment || item.role}
            </div>
            <div className="text-[11px] text-muted-foreground/80">
              {formatDate(item.date)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CarouselStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      .testimonial-swiper-pagination .swiper-pagination-bullet {
        width: 8px;
        height: 8px;
        background: hsl(var(--muted-foreground) / 0.35);
        opacity: 1;
        border-radius: 999px;
        display: inline-block;
        margin: 0 3px !important;
        transition: all 0.25s ease;
      }
      .testimonial-swiper-pagination .swiper-pagination-bullet-active {
        width: 22px;
        background: #1a5ff5;
      }
      .testimonial-carousel .swiper-slide {
        height: auto;
      }
    `,
      }}
    />
  );
}
