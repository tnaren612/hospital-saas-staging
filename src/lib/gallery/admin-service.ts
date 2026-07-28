/**
 * Admin gallery CMS — full site image management via gallery_images + Storage.
 */

import { createClient } from "@/lib/supabase/client";
import { clearImageCache, IMAGE_KEYS, IMAGE_SECTIONS } from "@/lib/image-service";

export type AdminGalleryImage = {
  id: string;
  section: string;
  key: string;
  title: string;
  alt_text: string;
  category: string;
  image_url: string;
  public_url?: string;
  storage_path: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const BUCKET = "gallery";

export { IMAGE_SECTIONS, IMAGE_KEYS };

const SELECT =
  "id, section, key, title, alt_text, alt, category, image_url, public_url, storage_path, sort_order, is_active, created_at, updated_at";

function mapAdmin(row: Record<string, unknown>): AdminGalleryImage {
  return {
    id: String(row.id),
    section: String(row.section || "gallery"),
    key: String(row.key || "image"),
    title: String(row.title || ""),
    alt_text: String(row.alt_text || row.alt || ""),
    category: String(row.category || ""),
    image_url: String(row.image_url || row.public_url || ""),
    public_url: String(row.public_url || row.image_url || ""),
    storage_path: String(row.storage_path || ""),
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function listAdminGalleryImages(): Promise<AdminGalleryImage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("gallery_images")
    .select(SELECT)
    .order("section", { ascending: true })
    .order("key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((r) => mapAdmin(r as Record<string, unknown>));
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function uploadGalleryImage(input: {
  file: File;
  section: string;
  key: string;
  title?: string;
  alt_text: string;
  category?: string;
  sort_order: number;
  is_active?: boolean;
}): Promise<AdminGalleryImage> {
  const supabase = createClient();
  const ext = input.file.name.includes(".")
    ? input.file.name.split(".").pop()
    : "jpg";
  const base =
    sanitizeFileName(input.file.name.replace(/\.[^.]+$/, "")) || "image";
  const section = input.section.toLowerCase().trim();
  const key = input.key.toLowerCase().trim();
  const storage_path = `${section}/${key}/${Date.now()}-${base}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Storage upload failed");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storage_path);

  const alt = input.alt_text.trim();
  const title = (input.title || alt).trim();
  const category = (input.category || section).trim();

  const { data, error } = await supabase
    .from("gallery_images")
    .insert({
      storage_path,
      public_url: publicUrl,
      image_url: publicUrl,
      alt,
      alt_text: alt,
      title,
      category,
      section,
      key,
      sort_order: input.sort_order,
      is_active: input.is_active !== false,
    })
    .select(SELECT)
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([storage_path]);
    throw new Error(error.message || "Failed to save gallery row");
  }

  clearImageCache();
  return mapAdmin(data as Record<string, unknown>);
}

export async function updateGalleryImageMeta(
  id: string,
  patch: {
    section?: string;
    key?: string;
    title?: string;
    alt_text?: string;
    category?: string;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<AdminGalleryImage> {
  const supabase = createClient();
  const body: Record<string, unknown> = {};
  if (patch.section !== undefined) body.section = patch.section.toLowerCase().trim();
  if (patch.key !== undefined) body.key = patch.key.toLowerCase().trim();
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.alt_text !== undefined) {
    body.alt_text = patch.alt_text.trim();
    body.alt = patch.alt_text.trim();
  }
  if (patch.category !== undefined) body.category = patch.category.trim();
  if (patch.sort_order !== undefined) body.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) body.is_active = patch.is_active;

  const { data, error } = await supabase
    .from("gallery_images")
    .update(body)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  clearImageCache();
  return mapAdmin(data as Record<string, unknown>);
}

export async function deleteGalleryImage(
  image: AdminGalleryImage
): Promise<void> {
  const supabase = createClient();

  if (image.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([image.storage_path]);
    if (storageError) {
      console.warn("[gallery] storage delete:", storageError.message);
    }
  }

  const { error } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", image.id);

  if (error) throw new Error(error.message);
  clearImageCache();
}
