"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CMS_PAGE_KEYS, type CmsPage, type CmsPageKey } from "@/lib/cms/types";

type FormState = {
  page_key: CmsPageKey;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  hero_title: string;
  hero_subtitle: string;
  body: string;
  seo_title: string;
  seo_description: string;
  seo_image_url: string;
  seo_keywords: string;
};

function emptyForm(key: CmsPageKey): FormState {
  return {
    page_key: key,
    title: key[0].toUpperCase() + key.slice(1),
    slug: key === "home" ? "" : key,
    status: "draft",
    hero_title: "",
    hero_subtitle: "",
    body: "",
    seo_title: "",
    seo_description: "",
    seo_image_url: "",
    seo_keywords: "",
  };
}

function fromPage(page: CmsPage): FormState {
  const hero = page.content.blocks.find((block) => block.type === "hero");
  const body = page.content.blocks.find((block) => block.type === "rich_text");
  return {
    page_key: page.page_key,
    title: page.title,
    slug: page.slug,
    status: page.status,
    hero_title: hero?.title || "",
    hero_subtitle: hero?.subtitle || "",
    body: body?.body || "",
    seo_title: page.seo.title || "",
    seo_description: page.seo.description || "",
    seo_image_url: page.seo.image_url || "",
    seo_keywords: page.seo.keywords || "",
  };
}

export function AdminPageCms() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm("home"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/cms/pages", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load CMS");
      setPages(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load CMS");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectPage = (key: CmsPageKey) => {
    const page = pages.find((item) => item.page_key === key);
    setForm(page ? fromPage(page) : emptyForm(key));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/cms/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_key: form.page_key,
          title: form.title,
          slug: form.slug || form.page_key,
          status: form.status,
          content: {
            blocks: [
              {
                id: `${form.page_key}-hero`,
                type: "hero",
                title: form.hero_title,
                subtitle: form.hero_subtitle,
                image_url: form.seo_image_url,
              },
              {
                id: `${form.page_key}-body`,
                type: "rich_text",
                body: form.body,
              },
            ],
          },
          seo: {
            title: form.seo_title,
            description: form.seo_description,
            image_url: form.seo_image_url,
            keywords: form.seo_keywords,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to save page");
      toast.success(form.status === "published" ? "Page published" : "Draft saved");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save page");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof FormState,
    label: string,
    multiline = false
  ) => (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <Textarea
          className="mt-1 min-h-28"
          value={String(form[key])}
          onChange={(event) =>
            setForm({ ...form, [key]: event.target.value })
          }
        />
      ) : (
        <Input
          className="mt-1"
          value={String(form[key])}
          onChange={(event) =>
            setForm({ ...form, [key]: event.target.value })
          }
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Website Pages</h1>
        <p className="text-sm text-muted-foreground">
          Edit tenant-owned page content, publication status and SEO.
        </p>
      </div>
      <Card>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
          <div className="space-y-1">
            {CMS_PAGE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectPage(key)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm capitalize ${
                  form.page_key === key ? "bg-primary-600 text-white" : "hover:bg-muted"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading pages…
              </p>
            )}
            {field("title", "Page title")}
            {field("slug", "Slug")}
            <div>
              <Label>Status</Label>
              <select
                className="mt-1 flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as FormState["status"],
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            {field("hero_title", "Hero title")}
            <div className="md:col-span-2">
              {field("hero_subtitle", "Hero subtitle", true)}
            </div>
            <div className="md:col-span-2">{field("body", "Page body", true)}</div>
            {field("seo_title", "SEO title")}
            {field("seo_keywords", "SEO keywords")}
            <div className="md:col-span-2">
              {field("seo_description", "SEO description", true)}
            </div>
            <div className="md:col-span-2">{field("seo_image_url", "Open Graph image URL")}</div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
              <Button variant="outline" asChild>
                <a href={form.page_key === "home" ? "/" : `/${form.slug || form.page_key}`} target="_blank">
                  <ExternalLink className="h-4 w-4" /> Preview
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
