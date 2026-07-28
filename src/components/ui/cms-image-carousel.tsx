"use client";

import { useMemo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Mousewheel, FreeMode } from "swiper/modules";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CmsImage } from "@/lib/image-service";
import { SafeImage } from "@/components/ui/safe-image";
import { cn } from "@/lib/utils";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/free-mode";

type Slide = {
  id: string;
  src: string;
  alt: string;
};

/**
 * Horizontal CMS gallery strip (Swiper).
 * - 1 image: static (no slider)
 * - 2–3: show without infinite loop
 * - 4+: scroll + arrows + dots + optional loop
 *
 * Desktop ~3 slides, tablet ~2, mobile 1.
 */
export function CmsImageCarousel({
  images,
  className,
  aspectClass = "aspect-[4/3]",
}: {
  images: Array<CmsImage | Slide>;
  className?: string;
  aspectClass?: string;
}) {
  const slides: Slide[] = useMemo(
    () =>
      images
        .map((img) => {
          if ("image_url" in img) {
            return {
              id: img.id,
              src: img.image_url,
              alt: img.alt_text || img.title || "Gallery image",
            };
          }
          return img as Slide;
        })
        .filter((s) => Boolean(s.src)),
    [images]
  );

  const uid = useMemo(
    () => `cms-carousel-${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  if (slides.length === 0) {
    return (
      <p className="text-center text-muted-foreground">
        No gallery images available.
      </p>
    );
  }

  // 1 image — no slider
  if (slides.length === 1) {
    return (
      <div
        className={cn(
          "relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl shadow-soft",
          aspectClass,
          className
        )}
      >
        <SlideImage src={slides[0].src} alt={slides[0].alt} priority />
      </div>
    );
  }

  const enableLoop = slides.length > 3;
  const showNav = slides.length > 3;

  return (
    <div className={cn("relative", className)}>
      <Swiper
        modules={[Navigation, Pagination, Mousewheel, FreeMode]}
        spaceBetween={16}
        slidesPerView={1}
        breakpoints={{
          640: { slidesPerView: 2, spaceBetween: 16 },
          1024: { slidesPerView: 3, spaceBetween: 20 },
        }}
        freeMode={{ enabled: slides.length > 3, sticky: false }}
        mousewheel={{ forceToAxis: true }}
        grabCursor
        loop={enableLoop}
        pagination={
          showNav
            ? {
                clickable: true,
                el: `.${uid}-pagination`,
              }
            : false
        }
        navigation={
          showNav
            ? {
                prevEl: `.${uid}-prev`,
                nextEl: `.${uid}-next`,
              }
            : false
        }
        watchOverflow
        className="!overflow-visible sm:!overflow-hidden"
      >
        {slides.map((slide, index) => (
          <SwiperSlide key={slide.id}>
            <div
              className={cn(
                "relative w-full overflow-hidden rounded-2xl shadow-soft",
                aspectClass
              )}
            >
              <SlideImage
                src={slide.src}
                alt={slide.alt}
                priority={index === 0}
              />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {showNav && (
        <>
          <button
            type="button"
            className={cn(
              uid + "-prev",
              "absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-soft backdrop-blur transition hover:bg-muted"
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn(
              uid + "-next",
              "absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-soft backdrop-blur transition hover:bg-muted"
            )}
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            className={cn(
              uid + "-pagination",
              "mt-4 flex justify-center gap-1.5"
            )}
          />
        </>
      )}
    </div>
  );
}

function SlideImage({
  src,
  alt,
  priority,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <SafeImage
      src={src}
      fallbackSrc="/images/gallery/hospital-exterior.jpg"
      alt={alt}
      fill
      className="object-cover object-center"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      priority={priority}
      fallbackLabel={alt}
    />
  );
}
