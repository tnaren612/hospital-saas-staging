import type { Metadata } from "next";
import { BlogContent } from "@/components/pages/blog-content";
import { getAllArticles } from "@/lib/blog-service";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "Health Tips & Blog",
  description:
    "Expert articles on asthma, COPD, lungs, COVID recovery, and general respiratory health.",
  path: "/blog",
});

export default async function BlogPage() {
  let articles: Awaited<ReturnType<typeof getAllArticles>> = [];
  try {
    articles = await getAllArticles();
  } catch (e) {
    console.error("[blog] listing failed:", e);
  }

  return <BlogContent articles={articles} />;
}
