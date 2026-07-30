"use client";

import { SmartImage } from "@/components/ui/smart-image";
import { useCmsBanner } from "@/hooks/use-cms-image";
import { cn } from "@/lib/utils";
import { useCmsPage } from "@/hooks/use-cms-page";
import type { CmsPageKey } from "@/lib/cms/types";

/**
 * Page hero/banner driven by gallery_images.
 * Lookup order (via getBanner): key=banner → key=background → first section image.
 * Falls back to gradient when no CMS image is set.
 */
export function CmsPageBanner({
  section,
  title,
  subtitle,
  children,
  className,
}: {
  section: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const cms = useCmsPage(section as CmsPageKey);
  const hero = cms.page?.content.blocks.find((block) => block.type === "hero");
  const resolvedTitle = hero?.title || cms.page?.title || title;
  const resolvedSubtitle = hero?.subtitle || subtitle;
  const { url, alt, loading } = useCmsBanner(section);
  const showImage = Boolean(url);

  return (
    <section
      className={cn(
        "relative min-h-[220px] overflow-hidden py-16 text-white md:min-h-[260px] md:py-20",
        !showImage && "bg-hero-gradient",
        className
      )}
    >
      {showImage ? (
        <>
          {/* relative + absolute required for next/image fill */}
          <div className="absolute inset-0 z-0">
            <div className="relative h-full w-full">
              <SmartImage
                src={url}
                alt={alt || resolvedTitle}
                fill
                priority
                className="object-cover object-center"
                sizes="100vw"
                fallbackLabel={resolvedTitle}
              />
            </div>
          </div>
          {/* Readable overlay — keep image visible */}
          <div className="absolute inset-0 z-[1] bg-primary-950/55" />
          <div className="absolute inset-0 z-[1] bg-gradient-to-r from-primary-950/70 via-primary-900/40 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 z-0 bg-mesh opacity-40" />
      )}

      {loading && (
        <div className="absolute inset-0 z-[2] animate-pulse bg-primary-900/20" />
      )}

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold md:text-5xl">{resolvedTitle}</h1>
        {resolvedSubtitle && (
          <p className="mt-4 max-w-2xl text-white/80">{resolvedSubtitle}</p>
        )}
        {children}
      </div>
    </section>
  );
}
