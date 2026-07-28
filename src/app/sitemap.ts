import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/data";
import blogJson from "@/data/blog.json";
import packagesJson from "@/data/packages.json";

type BlogRow = { slug: string; publishedAt?: string };
type PackageRow = { id: string; slug?: string };

const staticRoutes: { path: string; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/doctors", changeFrequency: "monthly", priority: 0.9 },
  { path: "/doctor", changeFrequency: "monthly", priority: 0.85 },
  { path: "/services", changeFrequency: "monthly", priority: 0.9 },
  { path: "/appointment", changeFrequency: "weekly", priority: 0.95 },
  { path: "/gallery", changeFrequency: "monthly", priority: 0.6 },
  { path: "/facilities", changeFrequency: "monthly", priority: 0.7 },
  { path: "/testimonials", changeFrequency: "monthly", priority: 0.7 },
  { path: "/insurance", changeFrequency: "monthly", priority: 0.7 },
  { path: "/health-packages", changeFrequency: "monthly", priority: 0.8 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/careers", changeFrequency: "weekly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.9 },
  { path: "/video-consult", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/$/, "");
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((r) => ({
    url: `${base}${r.path === "/" ? "" : r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const articles = (blogJson as BlogRow[]).map((a) => ({
    url: `${base}/blog/${a.slug}`,
    lastModified: a.publishedAt ? new Date(a.publishedAt) : now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const packages = (packagesJson as PackageRow[]).map((p) => {
    const slug = p.slug || p.id;
    return {
      url: `${base}/health-packages/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    };
  });

  return [...staticEntries, ...articles, ...packages];
}
