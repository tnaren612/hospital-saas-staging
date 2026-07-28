/**
 * Public gallery page — images with section=gallery (and legacy unscoped rows).
 */

import { getImages, type CmsImage } from "@/lib/image-service";

export type GalleryImageRow = {
  id: string;
  public_url: string;
  image_url: string;
  alt: string;
  alt_text: string;
  category: string;
  section: string;
  key: string;
  sort_order: number;
};

function toRow(img: CmsImage): GalleryImageRow {
  return {
    id: img.id,
    public_url: img.image_url,
    image_url: img.image_url,
    alt: img.alt_text,
    alt_text: img.alt_text,
    category: img.category || img.key || "gallery",
    section: img.section,
    key: img.key,
    sort_order: img.sort_order,
  };
}

/** Active images for the public Gallery page. */
export async function fetchGalleryImages(): Promise<GalleryImageRow[]> {
  const rows = await getImages("gallery");
  // Also include legacy rows without section if empty? Prefer section=gallery only.
  return rows.map(toRow);
}
