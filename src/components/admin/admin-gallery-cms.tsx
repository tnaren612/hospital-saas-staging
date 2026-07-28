"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ImagePlus,
  Trash2,
  Loader2,
  Pencil,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import {
  deleteGalleryImage,
  listAdminGalleryImages,
  updateGalleryImageMeta,
  uploadGalleryImage,
  IMAGE_KEYS,
  IMAGE_SECTIONS,
  type AdminGalleryImage,
} from "@/lib/gallery/admin-service";

export function AdminGalleryCms() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<AdminGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [section, setSection] = useState("home");
  const [key, setKey] = useState("hero");
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [category, setCategory] = useState("hospital");
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  const [filterSection, setFilterSection] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    section: "gallery",
    key: "image",
    title: "",
    alt_text: "",
    category: "",
    sort_order: 0,
    is_active: true,
  });
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAdminGalleryImages();
      setImages(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load gallery");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const filtered =
    filterSection === "all"
      ? images
      : images.filter((i) => i.section === filterSection);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Please select an image file");
      e.target.value = "";
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      e.target.value = "";
      return;
    }
    setFile(f);
    if (!altText.trim()) {
      setAltText(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    }
    if (!title.trim()) {
      setTitle(`${section} / ${key}`);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Choose an image file");
      return;
    }
    if (!altText.trim()) {
      toast.error("Alt text is required");
      return;
    }
    setUploading(true);
    try {
      await uploadGalleryImage({
        file,
        section,
        key,
        title: title || `${section} ${key}`,
        alt_text: altText,
        category: category || section,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      });
      toast.success(
        `Uploaded · section=${section} · key=${key}` +
          (section === "home" && key === "hero"
            ? " (added to homepage slider)"
            : "")
      );
      setFile(null);
      setAltText("");
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (img: AdminGalleryImage) => {
    setEditingId(img.id);
    setEdit({
      section: img.section,
      key: img.key,
      title: img.title,
      alt_text: img.alt_text,
      category: img.category,
      sort_order: img.sort_order,
      is_active: img.is_active,
    });
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      await updateGalleryImageMeta(id, edit);
      toast.success("Metadata saved");
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (img: AdminGalleryImage) => {
    if (!confirm("Delete this image from storage and the site?")) return;
    setSavingId(img.id);
    try {
      await deleteGalleryImage(img);
      toast.success("Image deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Website Image CMS</h1>
          <p className="text-sm text-muted-foreground">
            One gallery for the entire site. Set <strong>Section</strong> +{" "}
            <strong>Key</strong> so pages update automatically — no code changes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card className="border-primary-200 dark:border-primary-900">
        <CardContent className="space-y-4 p-6">
          <h2 className="font-semibold">Upload & assign placement</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2 lg:col-span-3">
              <Label className="mb-2 block">Image file</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={onFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
              />
              {previewUrl && (
                <div className="relative mt-3 aspect-[16/9] max-w-md overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Section *</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm capitalize"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                {IMAGE_SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-2 block">Key *</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm capitalize"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              >
                {IMAGE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Home slider: section=<b>home</b> key=<b>hero</b> (add multiple for carousel)
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>

            <div>
              <Label className="mb-2 block">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Home hero slide 1"
              />
            </div>

            <div>
              <Label className="mb-2 block">Alt text *</Label>
              <Input
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe the image"
              />
            </div>

            <div>
              <Label className="mb-2 block">Category (filter tag)</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="hospital"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Active (visible on site)
              </label>
            </div>
          </div>

          <Button onClick={() => void handleUpload()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload & publish"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterSection("all")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            filterSection === "all"
              ? "bg-primary-600 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          all
        </button>
        {IMAGE_SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterSection(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              filterSection === s
                ? "bg-primary-600 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <ImagePlus className="h-8 w-8 opacity-50" />
            <p>No images yet. Upload and assign section + key above.</p>
            <p className="text-xs">
              Run SQL migration <code>005_centralized_gallery_cms.sql</code> if columns are missing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((img) => {
            const isEditing = editingId === img.id;
            const busy = savingId === img.id;
            return (
              <Card key={img.id} className="overflow-hidden">
                <div className="relative aspect-[4/3]">
                  <SmartImage
                    src={img.image_url}
                    alt={img.alt_text}
                    fill
                    fallbackLabel={img.alt_text}
                  />
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <Badge variant="secondary">{img.section}</Badge>
                    <Badge>{img.key}</Badge>
                  </div>
                  {!img.is_active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                      Inactive
                    </div>
                  )}
                </div>
                <CardContent className="space-y-3 p-4">
                  {isEditing ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="mb-1 block text-xs">Section</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
                            value={edit.section}
                            onChange={(e) =>
                              setEdit({ ...edit, section: e.target.value })
                            }
                          >
                            {IMAGE_SECTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs">Key</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
                            value={edit.key}
                            onChange={(e) =>
                              setEdit({ ...edit, key: e.target.value })
                            }
                          >
                            {IMAGE_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Input
                        value={edit.title}
                        onChange={(e) =>
                          setEdit({ ...edit, title: e.target.value })
                        }
                        placeholder="Title"
                      />
                      <Input
                        value={edit.alt_text}
                        onChange={(e) =>
                          setEdit({ ...edit, alt_text: e.target.value })
                        }
                        placeholder="Alt text"
                      />
                      <Input
                        type="number"
                        value={edit.sort_order}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            sort_order: Number(e.target.value),
                          })
                        }
                        placeholder="Sort"
                      />
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(e) =>
                            setEdit({ ...edit, is_active: e.target.checked })
                          }
                        />
                        Active
                      </label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void saveEdit(img.id)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium">
                        {img.title || img.alt_text}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        sort #{img.sort_order} · {img.category || "—"}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(img)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void remove(img)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
