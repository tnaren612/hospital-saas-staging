/**
 * Blog / Health Tips CMS — single source of truth in Supabase.
 *
 * Table preference:
 *   1. public.blog_articles  (migration 006 — preferred)
 *   2. public.articles       (migration 001 — legacy fallback)
 *
 * Public reads: anon Supabase client (SSR + client safe).
 * Admin writes: browser session client (RLS requires is_admin()).
 *
 * Cover images: upload via existing Gallery CMS
 *   (uploadGalleryImage with section="blog", key="image")
 *   then store the returned public URL in cover_image.
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { ArticleCategory, BlogArticle } from "@/types";

export type BlogArticleInput = {
  title: string;
  excerpt: string;
  content: string;
  category: ArticleCategory;
  cover_image: string;
  tags: string[];
  author?: string;
  published_at?: string;
  is_published?: boolean;
};

const SELECT =
  "id, slug, title, excerpt, content, category, cover_image, tags, author, published_at, read_time, is_published, created_at, updated_at";

const DEFAULT_AUTHOR = process.env.NEXT_PUBLIC_CONTENT_AUTHOR || "Hospital Editorial Team";
const PREFERRED_TABLE = "blog_articles";
const FALLBACK_TABLE = "articles";

let resolvedTable: string | null = null;

function publicClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createSupabaseJs(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("could not find the table")
  );
}

type AnySupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

/** Resolve blog table once per process (prefer blog_articles). */
async function resolveTable(client: AnySupabase): Promise<string> {
  if (resolvedTable) return resolvedTable;

  const probe = await client.from(PREFERRED_TABLE).select("id").limit(1);
  if (!probe.error) {
    resolvedTable = PREFERRED_TABLE;
    return resolvedTable;
  }

  if (isMissingTableError(probe.error.message)) {
    const fb = await client.from(FALLBACK_TABLE).select("id").limit(1);
    if (!fb.error || !isMissingTableError(fb.error.message)) {
      resolvedTable = FALLBACK_TABLE;
      return resolvedTable;
    }
  }

  // Default preferred name so error messages stay clear
  resolvedTable = PREFERRED_TABLE;
  return resolvedTable;
}

function mapRow(row: Record<string, unknown>): BlogArticle {
  const published =
    row.published_at != null
      ? String(row.published_at).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title || ""),
    excerpt: String(row.excerpt || ""),
    content: String(row.content || ""),
    category: String(row.category || "general") as ArticleCategory,
    author: String(row.author || DEFAULT_AUTHOR),
    coverImage: String(row.cover_image || ""),
    publishedAt: published,
    readTime: Number(row.read_time) || 5,
    tags: Array.isArray(row.tags) ? (row.tags as string[]).map(String) : [],
  };
}

export function estimateReadTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 180));
}

export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  const suffix = Date.now().toString().slice(-4);
  return `${base || "article"}-${suffix}`;
}

/** Public: published articles, newest first. */
export async function getAllArticles(): Promise<BlogArticle[]> {
  if (!hasSupabaseConfig()) return [];

  const supabase = publicClient();
  const table = await resolveTable(supabase);
  const { data, error } = await supabase
    .from(table)
    .select(SELECT)
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[blog] getAllArticles:", error.message);
    throw new Error(error.message);
  }

  return (data || []).map((r: Record<string, unknown>) => mapRow(r));
}

/** Public: single published article by slug. */
export async function getArticleBySlug(
  slug: string
): Promise<BlogArticle | null> {
  if (!hasSupabaseConfig() || !slug) return null;

  const supabase = publicClient();
  const table = await resolveTable(supabase);
  const { data, error } = await supabase
    .from(table)
    .select(SELECT)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("[blog] getArticleBySlug:", error.message);
    throw new Error(error.message);
  }

  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

/**
 * Admin: list all articles (including unpublished).
 * Requires authenticated admin session (RLS).
 */
export async function listArticlesAdmin(): Promise<BlogArticle[]> {
  const supabase = createClient();
  const table = await resolveTable(supabase);
  const { data, error } = await supabase
    .from(table)
    .select(SELECT)
    .order("published_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map((r: Record<string, unknown>) => mapRow(r));
}

/** Admin: create article. Cover URL should come from Gallery CMS upload. */
export async function createArticle(
  input: BlogArticleInput
): Promise<BlogArticle> {
  const supabase = createClient();
  const table = await resolveTable(supabase);
  const slug = slugifyTitle(input.title);
  const read_time = estimateReadTime(input.content);
  const published_at =
    input.published_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from(table)
    .insert({
      slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      category: input.category,
      cover_image: input.cover_image,
      tags: input.tags,
      author: input.author || DEFAULT_AUTHOR,
      published_at,
      read_time,
      is_published: input.is_published !== false,
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

/** Admin: update article by id. */
export async function updateArticle(
  id: string,
  input: Partial<BlogArticleInput> & {
    slug?: string;
  }
): Promise<BlogArticle> {
  const supabase = createClient();
  const table = await resolveTable(supabase);
  const body: Record<string, unknown> = {};

  if (input.title !== undefined) body.title = input.title;
  if (input.excerpt !== undefined) body.excerpt = input.excerpt;
  if (input.content !== undefined) {
    body.content = input.content;
    body.read_time = estimateReadTime(input.content);
  }
  if (input.category !== undefined) body.category = input.category;
  if (input.cover_image !== undefined) body.cover_image = input.cover_image;
  if (input.tags !== undefined) body.tags = input.tags;
  if (input.author !== undefined) body.author = input.author;
  if (input.published_at !== undefined) {
    body.published_at = input.published_at.slice(0, 10);
  }
  if (input.is_published !== undefined) body.is_published = input.is_published;
  if (input.slug !== undefined) body.slug = input.slug;

  const { data, error } = await supabase
    .from(table)
    .update(body)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

/** Admin: delete article by id. */
export async function deleteArticle(id: string): Promise<void> {
  const supabase = createClient();
  const table = await resolveTable(supabase);
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
