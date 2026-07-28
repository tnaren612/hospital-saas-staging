import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/data";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/patient/dashboard",
          "/patient/appointments",
          "/patient/payments",
          "/patient/documents",
          "/patient/reports",
          "/patient/notifications",
          "/patient/profile",
          "/video-consult/meeting",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
