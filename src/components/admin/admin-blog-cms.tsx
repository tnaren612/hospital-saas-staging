"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Upload, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { articleSchema, type ArticleFormValues } from "@/lib/validation";
import {
  createArticle,
  deleteArticle,
  listArticlesAdmin,
  updateArticle,
} from "@/lib/blog-service";
import { uploadGalleryImage } from "@/lib/gallery/admin-service";
import { sanitizeText, stripHtml } from "@/lib/utils";
import type { BlogArticle } from "@/types";

const DEFAULT_COVER = "/assets/images/blog/new-article.svg";
const DEFAULT_AUTHOR = "Hospital Editorial Team";

export function AdminBlogCms() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(DEFAULT_COVER);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      category: "general",
      coverImage: DEFAULT_COVER,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listArticlesAdmin();
      setArticles(rows);
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error
          ? e.message
          : "Failed to load articles. Run migration 006_blog_articles.sql?"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setCoverFile(null);
    setCoverPreview(DEFAULT_COVER);
    reset({
      title: "",
      excerpt: "",
      content: "",
      category: "general",
      coverImage: DEFAULT_COVER,
      tags: "",
    });
  };

  const onSubmit = async (data: ArticleFormValues) => {
    setSaving(true);
    try {
      let coverImage = (data.coverImage || coverPreview || DEFAULT_COVER).trim();

      // Cover images go through existing Gallery CMS (section=blog, key=image)
      if (coverFile) {
        const uploaded = await uploadGalleryImage({
          file: coverFile,
          section: "blog",
          key: "image",
          title: data.title,
          alt_text: data.title || "Blog cover",
          category: "blog",
          sort_order: 0,
          is_active: true,
        });
        coverImage = uploaded.image_url || uploaded.public_url || coverImage;
      }

      const payload = {
        title: sanitizeText(stripHtml(data.title)),
        excerpt: sanitizeText(stripHtml(data.excerpt)),
        content: data.content,
        category: data.category,
        cover_image: coverImage,
        tags: (data.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        author: DEFAULT_AUTHOR,
      };

      if (editingId) {
        await updateArticle(editingId, payload);
        toast.success("Article updated — live on the public site");
      } else {
        await createArticle(payload);
        toast.success("Article published — live on the public site");
      }

      resetForm();
      await load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const edit = (article: BlogArticle) => {
    setEditingId(article.id);
    setCoverFile(null);
    setCoverPreview(article.coverImage || DEFAULT_COVER);
    reset({
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      category: article.category,
      coverImage: article.coverImage || DEFAULT_COVER,
      tags: article.tags.join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    try {
      await deleteArticle(id);
      toast.success("Article deleted");
      if (editingId === id) resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onCoverChange = (file: File | null) => {
    setCoverFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setCoverPreview(url);
      setValue("coverImage", url, { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Health Tips CMS</h1>
          <p className="text-sm text-muted-foreground">
            Articles are stored in Supabase (<code className="text-xs">blog_articles</code>).
            Cover images use Gallery CMS (<code className="text-xs">section=blog</code>,{" "}
            <code className="text-xs">key=image</code>).
          </p>
        </div>
        <Link
          href="/blog"
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
        >
          View public blog <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Plus className="h-4 w-4" />
            {editingId ? "Edit Article" : "Create Article"}
          </h2>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <Label className="mb-2 block">Title</Label>
              <Input {...register("title")} />
              {errors.title && (
                <p className="mt-1 text-xs text-emergency">
                  {errors.title.message}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Excerpt</Label>
              <Textarea {...register("excerpt")} className="min-h-[80px]" />
              {errors.excerpt && (
                <p className="mt-1 text-xs text-emergency">
                  {errors.excerpt.message}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Content (Markdown-ish text)</Label>
              <Textarea {...register("content")} className="min-h-[160px]" />
              {errors.content && (
                <p className="mt-1 text-xs text-emergency">
                  {errors.content.message}
                </p>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Category</Label>
              <select
                {...register("category")}
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              >
                <option value="lungs">Lungs</option>
                <option value="asthma">Asthma</option>
                <option value="covid">COVID</option>
                <option value="general">General Health</option>
                <option value="copd">COPD</option>
                <option value="critical-care">Critical Care</option>
              </select>
            </div>
            <div>
              <Label className="mb-2 block">Tags (comma separated)</Label>
              <Input {...register("tags")} placeholder="asthma, prevention" />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-2 block">Cover image (Gallery CMS)</Label>
              <input type="hidden" {...register("coverImage")} />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="relative h-28 w-full max-w-[200px] overflow-hidden rounded-xl border">
                  <SmartImage
                    src={coverPreview}
                    alt="Cover preview"
                    fill
                    fallbackLabel="Cover"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input px-4 py-3 text-sm font-medium hover:bg-muted/50">
                    <Upload className="h-4 w-4" />
                    Upload cover (section=blog / key=image)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        onCoverChange(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Uploads to Supabase Storage bucket{" "}
                    <code>gallery</code> and{" "}
                    <code>gallery_images</code>. The public URL is saved on the
                    article as <code>cover_image</code>.
                  </p>
                  {errors.coverImage && (
                    <p className="text-xs text-emergency">
                      {errors.coverImage.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={saving || loading}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : editingId ? (
                  "Update Article"
                ) : (
                  "Create Article"
                )}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading articles…
          </p>
        )}
        {!loading && articles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No articles yet. Create one above, or run the seed in{" "}
            <code>006_blog_articles.sql</code>.
          </p>
        )}
        {articles.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg">
                  <SmartImage
                    src={a.coverImage}
                    alt={a.title}
                    fill
                    fallbackLabel={a.category}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge variant="teal" className="capitalize">
                      {a.category}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {a.excerpt}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    /blog/{a.slug} · {a.readTime} min
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => edit(a)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
