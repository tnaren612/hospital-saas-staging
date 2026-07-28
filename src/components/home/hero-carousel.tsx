"use client";

import { useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade, Navigation, Pagination, A11y } from "swiper/modules";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHomeSliderImages } from "@/hooks/use-site-images";
import { SafeImage } from "@/components/ui/safe-image";
import { LOCAL_SITE_IMAGES } from "@/lib/gallery/site-images";
import type { SiteImage } from "@/lib/gallery/site-images";
import { cn } from "@/lib/utils";

import "swiper/css";
import "swiper/css/effect-fade";
import "swiper/css/navigation";
import "swiper/css/pagination";

/**
 * Home hero visual — dynamic Gallery sources only:
 * hospital banners · doctor banners · doctor profiles · gallery images
 * Falls back to local optimized photos when CMS empty.
 */
export function HeroCarousel({
  className,
  hospitalName,
}: {
  className?: string;
  hospitalName: string;
}) {
  const { images, loading } = useHomeSliderImages(hospitalName);
  const [paused, setPaused] = useState(false);

  if (loading) {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/20 bg-primary-900/40 shadow-lift",
          className
        )}
        aria-busy="true"
        aria-label="Loading hospital images"
      >
        <div className="absolute inset-0 animate-pulse bg-white/10" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/20 shadow-lift",
          className
        )}
      >
        <SafeImage
          src={LOCAL_SITE_IMAGES.hospitalHero}
          fallbackSrc={LOCAL_SITE_IMAGES.hospitalBuilding}
          alt={hospitalName}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          fallbackLabel={hospitalName}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-950/55 to-transparent" />
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/20 shadow-lift",
          className
        )}
      >
        <SlideImage image={images[0]} priority hospitalName={hospitalName} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-950/50 to-transparent" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/20 shadow-lift",
        className
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Swiper
        modules={[Autoplay, EffectFade, Navigation, Pagination, A11y]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        loop
        speed={800}
        grabCursor
        autoplay={
          paused
            ? false
            : {
                delay: 4000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }
        }
        pagination={{
          clickable: true,
          el: ".hero-swiper-pagination",
        }}
        navigation={{
          prevEl: ".hero-swiper-prev",
          nextEl: ".hero-swiper-next",
        }}
        a11y={{
          enabled: true,
          prevSlideMessage: "Previous hospital image",
          nextSlideMessage: "Next hospital image",
        }}
        className="h-full w-full"
      >
        {images.map((img, index) => (
          <SwiperSlide key={`${img.url}-${index}`}>
            <SlideImage
              image={img}
              priority={index === 0}
              hospitalName={hospitalName}
            />
          </SwiperSlide>
        ))}
      </Swiper>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-950/50 to-transparent" />

      <button
        type="button"
        className="hero-swiper-prev absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 touch-manipulation"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="hero-swiper-next absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 touch-manipulation"
        aria-label="Next slide"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="hero-swiper-pagination absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-1.5 !w-full" />

      <HeroCarouselStyles />
    </div>
  );
}

function SlideImage({
  image,
  priority,
  hospitalName,
}: {
  image: SiteImage;
  priority?: boolean;
  hospitalName: string;
}) {
  return (
    <div className="relative h-full w-full">
      <SafeImage
        src={image.url}
        fallbackSrc={LOCAL_SITE_IMAGES.hospitalHero}
        alt={image.alt || hospitalName}
        fill
        priority={priority}
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
        fallbackLabel={hospitalName}
      />
    </div>
  );
}

function HeroCarouselStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      .hero-swiper-pagination .swiper-pagination-bullet {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.45);
        opacity: 1;
        border-radius: 999px;
        display: inline-block;
        margin: 0 3px !important;
        transition: all 0.25s ease;
      }
      .hero-swiper-pagination .swiper-pagination-bullet-active {
        width: 22px;
        background: #fff;
      }
    `,
      }}
    />
  );
}
