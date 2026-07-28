"use client";

/**
 * SafeImage — production image with cascade fallback.
 * 1) primary src
 * 2) fallbackSrc (local default)
  * 3) branded gradient placeholder (never blank)
 *
 * Uses next/image with correct unoptimized rules for SVG/remote.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  isValidImageSrc,
  resolveImageSrc,
} from "@/lib/assets/image-resolve";

export type SafeImageProps = {
  src?: string | null;
  alt: string;
  fallbackSrc?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  /** Applied to the outer relative box when fill */
  containerClassName?: string;
  priority?: boolean;
  sizes?: string;
  fallbackLabel?: string;
  blurDataURL?: string;
  decorative?: boolean;
};

const DEFAULT_BLUR =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxNDQ5ZTEiIG9wYWNpdHk9Ii4xNSIvPjwvc3ZnPg==";

function shouldUnoptimize(src: string): boolean {
  const lower = src.toLowerCase();
  if (lower.endsWith(".svg")) return true;
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  if (/^https?:\/\//i.test(src)) {
    // Optimize known hosts only
    if (
      src.includes("images.unsplash.com") ||
      src.includes(".supabase.co")
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function GradientFallback({
  fill,
  className,
  label,
  alt,
  decorative,
  width,
  height,
}: {
  fill?: boolean;
  className?: string;
  label?: string;
  alt: string;
  decorative?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-700 to-teal text-white/90",
        fill && "absolute inset-0",
        className
      )}
      style={!fill && width && height ? { width, height } : undefined}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative || undefined}
    >
      <div className="p-4 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
          SSH
        </div>
        {(label || alt) && (
          <p className="text-xs font-medium opacity-90">{label || alt}</p>
        )}
      </div>
    </div>
  );
}

export function SafeImage({
  src,
  alt,
  fallbackSrc,
  fill,
  width,
  height,
  className,
  containerClassName,
  priority,
  sizes,
  fallbackLabel,
  blurDataURL,
  decorative,
}: SafeImageProps) {
  const chain = useMemo(() => {
    const list: string[] = [];
    if (isValidImageSrc(src)) list.push(src.trim());
    if (isValidImageSrc(fallbackSrc)) list.push(fallbackSrc.trim());
    return list;
  }, [src, fallbackSrc]);

  const chainKey = chain.join("|");

  const [index, setIndex] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  // Reset when sources change
  useEffect(() => {
    setIndex(0);
    setGaveUp(false);
  }, [chainKey]);

  const current = chain[index];
  const imageAlt = decorative ? "" : alt;

  if (gaveUp || !current) {
    return (
      <GradientFallback
        fill={fill}
        className={className}
        label={fallbackLabel}
        alt={alt}
        decorative={decorative}
        width={width}
        height={height}
      />
    );
  }

  const unoptimized = shouldUnoptimize(current);
  const useBlur = !current.toLowerCase().endsWith(".svg") && !current.startsWith("data:");

  const onError = () => {
    if (index + 1 < chain.length) {
      setIndex((i) => i + 1);
    } else {
      setGaveUp(true);
    }
  };

  const img = fill ? (
    <Image
      src={current}
      alt={imageAlt}
      fill
      className={cn("object-cover", className)}
      onError={onError}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes || "100vw"}
      unoptimized={unoptimized}
      placeholder={useBlur ? "blur" : "empty"}
      blurDataURL={useBlur ? blurDataURL || DEFAULT_BLUR : undefined}
    />
  ) : (
    <Image
      src={current}
      alt={imageAlt}
      width={width || 800}
      height={height || 600}
      className={cn("object-cover", className)}
      onError={onError}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes}
      unoptimized={unoptimized}
      placeholder={useBlur ? "blur" : "empty"}
      blurDataURL={useBlur ? blurDataURL || DEFAULT_BLUR : undefined}
    />
  );

  if (fill && containerClassName) {
    return (
      <div className={cn("relative overflow-hidden", containerClassName)}>
        {img}
      </div>
    );
  }

  return img;
}

/** Backward-compatible alias */
export { SafeImage as SmartImageEnhanced };

export function pickSrc(
  ...candidates: Array<string | null | undefined>
): string {
  return resolveImageSrc(candidates, "");
}
