"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { Section } from "@/components/ui/section";
import { SmartImage } from "@/components/ui/smart-image";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { CmsImageCarousel } from "@/components/ui/cms-image-carousel";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { getImages, type CmsImage } from "@/lib/image-service";
import galleryJson from "@/data/gallery.json";
import { cn } from "@/lib/utils";

/** Local high-quality gallery (public/images) — used when CMS empty */
function catalogAsCms(): CmsImage[] {
  return (galleryJson as { id: string; src: string; alt: string; category: string; order: number }[]).map(
    (g) => ({
      id: g.id,
      section: "gallery",
      key: g.category || "image",
      title: g.alt,
      alt_text: g.alt,
      category: g.category,
      image_url: g.src,
      storage_path: "",
      sort_order: g.order,
      is_active: true,
    })
  );
}

export function GalleryContent() {
  const [images, setImages] = useState<CmsImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<CmsImage | null>(null);
  const [source, setSource] = useState<"cms" | "catalog">("catalog");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await getImages("gallery");
        if (cancelled) return;
        if (rows.length > 0) {
          setImages(rows);
          setSource("cms");
        } else {
          setImages(catalogAsCms());
          setSource("catalog");
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load gallery images"
          );
          setImages(catalogAsCms());
          setSource("catalog");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const categories = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          images.map((i) => i.category || i.key || "gallery").filter(Boolean)
        )
      ),
    ],
    [images]
  );

  const filtered =
    filter === "all"
      ? images
      : images.filter((i) => (i.category || i.key || "gallery") === filter);

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="gallery"
        title="Hospital Gallery"
        subtitle="A visual tour of our hospital spaces at Sri Srinivasa Hospital, Badvel."
      />
      <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: "Gallery" }]} />
      </div>

      <Section>
        {loading ? (
          <div
            className="flex min-h-[200px] items-center justify-center gap-2 text-muted-foreground"
            aria-busy="true"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading gallery…
          </div>
        ) : error && images.length === 0 ? (
          <EmptyState
            title="Gallery unavailable"
            description={error}
            actionLabel="Contact us"
            actionHref="/contact"
          />
        ) : images.length === 0 ? (
          <EmptyState
            title="No gallery images yet"
            description="Upload images in Admin → Gallery to populate this page."
          />
        ) : (
          <>
            {source === "catalog" && (
              <p className="mb-4 text-center text-xs text-muted-foreground">
                Showing production showcase images. Replace anytime via Admin
                Gallery CMS.
              </p>
            )}
            <div className="mb-6 flex flex-wrap gap-2 sm:mb-8">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilter(c)}
                  className={cn(
                    "min-h-10 rounded-full px-4 py-2 text-xs font-semibold capitalize transition touch-manipulation sm:text-sm",
                    filter === c
                      ? "bg-primary-600 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground">
                No images in this category.
              </p>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="px-0 sm:px-2"
              >
                <div className="hidden sm:block">
                  <CmsImageCarousel images={filtered} />
                </div>
                <div className="mt-0 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:mt-8 lg:grid-cols-3">
                  {filtered.map((img) => (
                    <button
                      key={`thumb-${img.id}`}
                      type="button"
                      onClick={() => setActive(img)}
                      className="group relative aspect-[16/10] overflow-hidden rounded-xl text-left shadow-soft touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View ${img.alt_text || img.title}`}
                    >
                      <SmartImage
                        src={img.image_url}
                        alt={img.alt_text || img.title || "Gallery image"}
                        fill
                        className="object-cover transition duration-500 group-hover:scale-105"
                        sizes="(max-width: 400px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        fallbackLabel={img.alt_text}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                      <span className="absolute bottom-2 left-2 right-2 text-xs font-medium text-white">
                        {img.alt_text || img.title}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </Section>

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6"
            onClick={() => setActive(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Gallery image preview"
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur touch-manipulation sm:right-6 sm:top-6"
              onClick={() => setActive(null)}
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
            <div
              className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <SmartImage
                src={active.image_url}
                alt={active.alt_text || "Gallery preview"}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
