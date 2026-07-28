"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Upload,
  ExternalLink,
  Package,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { TableSkeleton } from "@/components/admin/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import { uploadGalleryImage } from "@/lib/gallery/admin-service";
import { createClient } from "@/lib/supabase/client";
import type { Department } from "@/lib/hms/types";
import { PACKAGE_TYPES } from "@/lib/health-packages/types";
import { formatCurrency } from "@/lib/utils";

type AdminPackage = {
  id: string;
  slug: string;
  name: string;
  subtitle?: string;
  short_description?: string;
  description?: string;
  price: number;
  offer_price?: number | null;
  currency?: string;
  department_id?: string | null;
  featured?: boolean;
  popular?: boolean;
  package_type?: string;
  duration?: string;
  report_time?: string;
  preparation?: string;
  tests_included?: string[] | unknown;
  services_included?: string[] | unknown;
  benefits?: string[] | unknown;
  instructions?: string[] | unknown;
  faqs?: { question: string; answer: string }[] | unknown;
  hero_image?: string;
  banner_image?: string;
  gallery_images?: string[] | unknown;
  icon?: string;
  brochure_pdf?: string;
  booking_enabled?: boolean;
  is_active?: boolean;
  display_order?: number;
  seo_title?: string | null;
  seo_description?: string | null;
  department?: { name?: string } | null;
};

const emptyForm = {
  name: "",
  slug: "",
  subtitle: "",
  short_description: "",
  description: "",
  price: "0",
  offer_price: "",
  currency: "INR",
  department_id: "",
  featured: false,
  popular: false,
  package_type: "respiratory",
  duration: "",
  report_time: "",
  preparation: "",
  tests_included: "",
  services_included: "",
  benefits: "",
  instructions: "",
  faqs_text: "",
  hero_image: "",
  banner_image: "",
  gallery_images: "",
  icon: "",
  brochure_pdf: "",
  booking_enabled: true,
  is_active: true,
  display_order: "0",
  seo_title: "",
  seo_description: "",
};

function lines(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseFaqs(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [q, ...rest] = line.split("|");
      return { question: (q || "").trim(), answer: rest.join("|").trim() };
    })
    .filter((f) => f.question && f.answer);
}

function arrToLines(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join("\n");
  return "";
}

export function PackagesManager() {
  const [items, setItems] = useState<AdminPackage[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, dRes] = await Promise.all([
        hmsGet<{ data: AdminPackage[] }>("/api/admin/packages", { q }),
        hmsGet<{ data: Department[] }>("/api/admin/departments"),
      ]);
      setItems(pRes.data || []);
      setDepartments(dRes.data || []);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Failed to load packages (run migration 010?)"
      );
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const startEdit = (p: AdminPackage) => {
    setEditingId(p.id);
    const faqs = Array.isArray(p.faqs)
      ? (p.faqs as { question: string; answer: string }[])
          .map((f) => `${f.question} | ${f.answer}`)
          .join("\n")
      : "";
    setForm({
      name: p.name || "",
      slug: p.slug || "",
      subtitle: p.subtitle || "",
      short_description: p.short_description || "",
      description: p.description || "",
      price: String(p.price ?? 0),
      offer_price: p.offer_price != null ? String(p.offer_price) : "",
      currency: p.currency || "INR",
      department_id: p.department_id || "",
      featured: Boolean(p.featured),
      popular: Boolean(p.popular),
      package_type: p.package_type || "general",
      duration: p.duration || "",
      report_time: p.report_time || "",
      preparation: p.preparation || "",
      tests_included: arrToLines(p.tests_included),
      services_included: arrToLines(p.services_included),
      benefits: arrToLines(p.benefits),
      instructions: arrToLines(p.instructions),
      faqs_text: faqs,
      hero_image: p.hero_image || "",
      banner_image: p.banner_image || "",
      gallery_images: arrToLines(p.gallery_images),
      icon: p.icon || "",
      brochure_pdf: p.brochure_pdf || "",
      booking_enabled: p.booking_enabled !== false,
      is_active: p.is_active !== false,
      display_order: String(p.display_order ?? 0),
      seo_title: p.seo_title || "",
      seo_description: p.seo_description || "",
    });
    setOpen(true);
  };

  const uploadImage = async (
    file: File | null,
    key: "hero" | "banner" | "gallery" | "icon",
    field: "hero_image" | "banner_image" | "icon" | "gallery_images"
  ) => {
    if (!file) return;
    setUploading(key);
    try {
      const uploaded = await uploadGalleryImage({
        file,
        section: "package",
        key,
        title: form.name || `Package ${key}`,
        alt_text: form.name || `Package ${key}`,
        category: "package",
        sort_order: 0,
        is_active: true,
      });
      const url = uploaded.image_url || uploaded.public_url || "";
      if (field === "gallery_images") {
        setForm((f) => ({
          ...f,
          gallery_images: f.gallery_images
            ? `${f.gallery_images}\n${url}`
            : url,
        }));
      } else {
        setForm((f) => ({ ...f, [field]: url }));
      }
      toast.success(`${key} uploaded via Gallery CMS`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const uploadBrochure = async (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      toast.error("Please upload a PDF brochure");
      return;
    }
    setUploading("brochure");
    try {
      const supabase = createClient();
      const path = `package/brochure/${Date.now()}-${file.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")}`;
      const { error } = await supabase.storage
        .from("gallery")
        .upload(path, file, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw new Error(error.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from("gallery").getPublicUrl(path);
      setForm((f) => ({ ...f, brochure_pdf: publicUrl }));
      toast.success("Brochure uploaded to Storage (package/brochure)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF upload failed");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        subtitle: form.subtitle,
        short_description: form.short_description,
        description: form.description,
        price: Number(form.price) || 0,
        offer_price: form.offer_price === "" ? null : Number(form.offer_price),
        currency: form.currency || "INR",
        department_id: form.department_id || null,
        featured: form.featured,
        popular: form.popular,
        package_type: form.package_type,
        duration: form.duration,
        report_time: form.report_time,
        preparation: form.preparation,
        tests_included: lines(form.tests_included),
        services_included: lines(form.services_included),
        benefits: lines(form.benefits),
        instructions: lines(form.instructions),
        faqs: parseFaqs(form.faqs_text),
        hero_image: form.hero_image,
        banner_image: form.banner_image,
        gallery_images: lines(form.gallery_images),
        icon: form.icon,
        brochure_pdf: form.brochure_pdf,
        booking_enabled: form.booking_enabled,
        is_active: form.is_active,
        display_order: Number(form.display_order) || 0,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
      };

      if (editingId) {
        await hmsMutate(`/api/admin/packages/${editingId}`, "PATCH", payload);
        toast.success("Package updated");
      } else {
        await hmsMutate("/api/admin/packages", "POST", payload);
        toast.success("Package created");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this package?")) return;
    try {
      await hmsMutate(`/api/admin/packages/${id}`, "DELETE");
      toast.success("Package deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health Packages CMS"
        description="CMS-driven packages · images via Gallery (section=package) · PDF via package/brochure"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4" /> Add Package
          </Button>
        }
      />

      <Input
        placeholder="Search packages…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search packages"
      />

      {open && (
        <Card className="border-primary-200 shadow-lift dark:border-primary-900">
          <CardContent className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
            <h2 className="font-semibold">
              {editingId ? "Edit Package" : "Create Package"}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="auto from name"
                />
              </Field>
              <Field label="Subtitle">
                <Input
                  value={form.subtitle}
                  onChange={(e) =>
                    setForm({ ...form, subtitle: e.target.value })
                  }
                />
              </Field>
              <Field label="Category / Type">
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                  value={form.package_type}
                  onChange={(e) =>
                    setForm({ ...form, package_type: e.target.value })
                  }
                >
                  {PACKAGE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Department">
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                  value={form.department_id}
                  onChange={(e) =>
                    setForm({ ...form, department_id: e.target.value })
                  }
                >
                  <option value="">— None —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Display order">
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({ ...form, display_order: e.target.value })
                  }
                />
              </Field>
              <Field label="List price (₹)">
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </Field>
              <Field label="Offer price (₹)">
                <Input
                  type="number"
                  value={form.offer_price}
                  onChange={(e) =>
                    setForm({ ...form, offer_price: e.target.value })
                  }
                />
              </Field>
              <Field label="Duration">
                <Input
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: e.target.value })
                  }
                />
              </Field>
              <Field label="Report time">
                <Input
                  value={form.report_time}
                  onChange={(e) =>
                    setForm({ ...form, report_time: e.target.value })
                  }
                />
              </Field>

              <div className="flex flex-wrap gap-4 md:col-span-2">
                {(
                  [
                    ["featured", "Featured"],
                    ["popular", "Popular"],
                    ["booking_enabled", "Booking enabled"],
                    ["is_active", "Active"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form[key] as boolean}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="md:col-span-2">
                <Field label="Short description">
                  <Textarea
                    value={form.short_description}
                    onChange={(e) =>
                      setForm({ ...form, short_description: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Full description">
                  <Textarea
                    className="min-h-[100px]"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Preparation">
                  <Textarea
                    value={form.preparation}
                    onChange={(e) =>
                      setForm({ ...form, preparation: e.target.value })
                    }
                  />
                </Field>
              </div>

              {(
                [
                  ["tests_included", "Tests included (one per line)"],
                  ["services_included", "Services included (one per line)"],
                  ["benefits", "Benefits (one per line)"],
                  ["instructions", "Instructions (one per line)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="md:col-span-2">
                  <Field label={label}>
                    <Textarea
                      value={form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                    />
                  </Field>
                </div>
              ))}

              <div className="md:col-span-2">
                <Field label="FAQs (Question | Answer per line)">
                  <Textarea
                    value={form.faqs_text}
                    onChange={(e) =>
                      setForm({ ...form, faqs_text: e.target.value })
                    }
                  />
                </Field>
              </div>

              {/* Media */}
              <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["hero_image", "hero", "Hero image"],
                    ["banner_image", "banner", "Banner image"],
                    ["icon", "icon", "Icon"],
                  ] as const
                ).map(([field, key, label]) => (
                  <div key={field} className="space-y-2">
                    <Label>{label} (Gallery · package/{key})</Label>
                    <div className="relative h-24 w-full overflow-hidden rounded-xl border">
                      <SmartImage
                        src={form[field]}
                        alt={label}
                        fill
                        fallbackLabel={label}
                      />
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Upload className="h-4 w-4" />
                      {uploading === key ? "Uploading…" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={!!uploading}
                        onChange={(e) =>
                          void uploadImage(
                            e.target.files?.[0] ?? null,
                            key,
                            field
                          )
                        }
                      />
                    </label>
                    <Input
                      value={form[field]}
                      onChange={(e) =>
                        setForm({ ...form, [field]: e.target.value })
                      }
                      placeholder="or paste URL"
                    />
                  </div>
                ))}
              </div>

              <div className="md:col-span-2">
                <Field label="Gallery image URLs (one per line)">
                  <Textarea
                    value={form.gallery_images}
                    onChange={(e) =>
                      setForm({ ...form, gallery_images: e.target.value })
                    }
                  />
                </Field>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Upload className="h-4 w-4" />
                  {uploading === "gallery" ? "Uploading…" : "Add gallery image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!!uploading}
                    onChange={(e) =>
                      void uploadImage(
                        e.target.files?.[0] ?? null,
                        "gallery",
                        "gallery_images"
                      )
                    }
                  />
                </label>
              </div>

              <div className="md:col-span-2">
                <Field label="Brochure PDF URL">
                  <Input
                    value={form.brochure_pdf}
                    onChange={(e) =>
                      setForm({ ...form, brochure_pdf: e.target.value })
                    }
                  />
                </Field>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Upload className="h-4 w-4" />
                  {uploading === "brochure"
                    ? "Uploading…"
                    : "Upload PDF (package/brochure)"}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={!!uploading}
                    onChange={(e) =>
                      void uploadBrochure(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>

              <Field label="SEO title">
                <Input
                  value={form.seo_title}
                  onChange={(e) =>
                    setForm({ ...form, seo_title: e.target.value })
                  }
                />
              </Field>
              <Field label="SEO description">
                <Input
                  value={form.seo_description}
                  onChange={(e) =>
                    setForm({ ...form, seo_description: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={saving || !!uploading}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save package
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Flags</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        <Package className="mx-auto mb-2 h-6 w-6 opacity-50" />
                        No packages yet. Run migration 010 or create one.
                      </td>
                    </tr>
                  ) : (
                    items.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            /health-packages/{p.slug}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.department?.name || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize">
                          {p.package_type || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {p.offer_price != null ? (
                            <>
                              <span className="font-semibold">
                                {formatCurrency(Number(p.offer_price))}
                              </span>
                              <span className="ml-2 text-xs line-through text-muted-foreground">
                                {formatCurrency(Number(p.price))}
                              </span>
                            </>
                          ) : (
                            formatCurrency(Number(p.price) || 0)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {p.featured ? (
                              <Badge variant="teal">Featured</Badge>
                            ) : null}
                            {p.popular ? (
                              <Badge variant="secondary">Popular</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              p.is_active === false ? "warning" : "success"
                            }
                          >
                            {p.is_active === false ? "Inactive" : "Active"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Link
                              href={`/health-packages/${p.slug}`}
                              target="_blank"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
                              aria-label="View public page"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void remove(p.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
