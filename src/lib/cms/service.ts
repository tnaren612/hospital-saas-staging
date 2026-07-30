import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";
import type {
  CmsNavigationItem,
  CmsNavigationLocation,
  CmsAnnouncement,
  CmsPage,
  CmsPageContent,
  CmsPageKey,
  CmsPageStatus,
} from "@/lib/cms/types";

function canUseCmsDatabase(): boolean {
  return Boolean(hasSupabaseConfig() && getServiceRoleKey());
}

function mapPage(row: Record<string, unknown>): CmsPage {
  const content = (row.content || {}) as Partial<CmsPageContent>;
  return {
    id: String(row.id),
    hospital_id: String(row.hospital_id),
    page_key: String(row.page_key) as CmsPageKey,
    title: String(row.title || ""),
    slug: String(row.slug || ""),
    status: String(row.status || "draft") as CmsPageStatus,
    content: {
      blocks: Array.isArray(content.blocks) ? content.blocks : [],
    },
    seo: (row.seo || {}) as CmsPage["seo"],
    published_at: row.published_at ? String(row.published_at) : null,
    updated_at: String(row.updated_at || ""),
  };
}

export async function listCmsPages(hospitalId: string): Promise<CmsPage[]> {
  if (!hospitalId || !canUseCmsDatabase()) return [];
  const { data, error } = await createServiceRoleClient()
    .from("cms_pages")
    .select("*")
    .eq("hospital_id", hospitalId)
    .order("page_key");
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapPage(row as Record<string, unknown>));
}

export async function getPublishedCmsPage(
  hospitalId: string,
  pageKey: CmsPageKey
): Promise<CmsPage | null> {
  if (!hospitalId || !canUseCmsDatabase()) return null;
  const { data, error } = await createServiceRoleClient()
    .from("cms_pages")
    .select("*")
    .eq("hospital_id", hospitalId)
    .eq("page_key", pageKey)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPage(data as Record<string, unknown>) : null;
}

export async function saveCmsPage(input: {
  hospitalId: string;
  pageKey: CmsPageKey;
  title: string;
  slug: string;
  status: CmsPageStatus;
  content: CmsPageContent;
  seo: CmsPage["seo"];
  actorId?: string | null;
}): Promise<CmsPage> {
  if (!input.hospitalId || !canUseCmsDatabase()) {
    throw new Error("CMS database is not configured");
  }
  const sb = createServiceRoleClient();
  const payload = {
    hospital_id: input.hospitalId,
    page_key: input.pageKey,
    title: input.title,
    slug: input.slug,
    status: input.status,
    content: input.content,
    seo: input.seo,
    published_at:
      input.status === "published"
        ? new Date().toISOString()
        : null,
    updated_by: input.actorId || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("cms_pages")
    .upsert(payload, { onConflict: "hospital_id,page_key" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Unable to save page");

  const page = mapPage(data as Record<string, unknown>);
  const { count } = await sb
    .from("cms_page_versions")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id);
  await sb.from("cms_page_versions").insert({
    hospital_id: input.hospitalId,
    page_id: page.id,
    version: Number(count || 0) + 1,
    title: page.title,
    content: page.content,
    seo: page.seo,
    created_by: input.actorId || null,
  });
  return page;
}

export async function getCmsNavigation(
  hospitalId: string,
  location: CmsNavigationLocation
): Promise<CmsNavigationItem[]> {
  if (!hospitalId || !canUseCmsDatabase()) return [];
  const { data, error } = await createServiceRoleClient()
    .from("cms_navigation")
    .select("items")
    .eq("hospital_id", hospitalId)
    .eq("location", location)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Array.isArray(data?.items)
    ? (data.items as unknown as CmsNavigationItem[])
    : [];
}

export async function saveCmsNavigation(input: {
  hospitalId: string;
  location: CmsNavigationLocation;
  items: CmsNavigationItem[];
  actorId?: string | null;
}): Promise<CmsNavigationItem[]> {
  if (!input.hospitalId || !canUseCmsDatabase()) {
    throw new Error("CMS database is not configured");
  }
  const { error } = await createServiceRoleClient()
    .from("cms_navigation")
    .upsert(
      {
        hospital_id: input.hospitalId,
        location: input.location,
        items: input.items,
        updated_by: input.actorId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hospital_id,location" }
    );
  if (error) throw new Error(error.message);
  return input.items;
}

export async function getPublishedAnnouncement(
  hospitalId: string
): Promise<CmsAnnouncement | null> {
  if (!hospitalId || !canUseCmsDatabase()) return null;
  const now = new Date().toISOString();
  const { data, error } = await createServiceRoleClient()
    .from("cms_announcements")
    .select("id, title, message, link_url, starts_at, ends_at")
    .eq("hospital_id", hospitalId)
    .eq("status", "published")
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    title: String(data.title || ""),
    message: String(data.message || ""),
    link_url: String(data.link_url || ""),
    starts_at: data.starts_at ? String(data.starts_at) : null,
    ends_at: data.ends_at ? String(data.ends_at) : null,
  };
}

export async function listCmsAnnouncements(
  hospitalId: string
): Promise<CmsAnnouncement[]> {
  if (!hospitalId || !canUseCmsDatabase()) return [];
  const { data, error } = await createServiceRoleClient()
    .from("cms_announcements")
    .select("id, title, message, link_url, starts_at, ends_at, status")
    .eq("hospital_id", hospitalId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    title: String(row.title || ""),
    message: String(row.message || ""),
    link_url: String(row.link_url || ""),
    starts_at: row.starts_at ? String(row.starts_at) : null,
    ends_at: row.ends_at ? String(row.ends_at) : null,
    status: String(row.status || "draft") as CmsPageStatus,
  }));
}

export async function saveCmsAnnouncement(input: {
  hospitalId: string;
  id?: string;
  title: string;
  message: string;
  linkUrl?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  status: CmsPageStatus;
}): Promise<CmsAnnouncement> {
  if (!input.hospitalId || !canUseCmsDatabase()) {
    throw new Error("CMS database is not configured");
  }
  const payload = {
    hospital_id: input.hospitalId,
    title: input.title,
    message: input.message,
    link_url: input.linkUrl || null,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? createServiceRoleClient()
        .from("cms_announcements")
        .update(payload)
        .eq("id", input.id)
        .eq("hospital_id", input.hospitalId)
    : createServiceRoleClient().from("cms_announcements").insert(payload);
  const { data, error } = await query
    .select("id, title, message, link_url, starts_at, ends_at, status")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Unable to save announcement");
  }
  return {
    id: String(data.id),
    title: String(data.title),
    message: String(data.message),
    link_url: String(data.link_url || ""),
    starts_at: data.starts_at ? String(data.starts_at) : null,
    ends_at: data.ends_at ? String(data.ends_at) : null,
    status: String(data.status) as CmsPageStatus,
  };
}
