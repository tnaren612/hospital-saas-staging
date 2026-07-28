"use client";

/**
 * SmartImage — thin alias over SafeImage for backward compatibility.
 * All call sites get cascade fallback + SVG-safe loading.
 */

import { SafeImage, type SafeImageProps } from "@/components/ui/safe-image";

export type SmartImageProps = SafeImageProps;

export function SmartImage(props: SmartImageProps) {
  return <SafeImage {...props} />;
}
