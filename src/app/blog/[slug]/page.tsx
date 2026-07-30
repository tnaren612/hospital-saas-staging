import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticleContent } from "@/components/pages/blog-article-content";
import { getArticleBySlug } from "@/lib/blog-service";
import { createMetadata } from "@/lib/seo";

/** Dynamic CMS content — no generateStaticParams. */
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const article = await getArticleBySlug(params.slug);
    if (!article) {
      return createMetadata({
        title: "Article not found",
        path: `/blog/${params.slug}`,
        noIndex: true,
      });
    }

    return createMetadata({
      title: article.title,
      description: article.excerpt,
      path: `/blog/${article.slug}`,
      image: article.coverImage || "/assets/images/hospital/og-image.svg",
    });
  } catch {
    return createMetadata({
      title: "Health Tips",
      path: `/blog/${params.slug}`,
    });
  }
}

export default async function BlogArticlePage(props: PageProps) {
  const params = await props.params;
  let article = null;
  try {
    article = await getArticleBySlug(params.slug);
  } catch (e) {
    console.error("[blog] detail failed:", e);
  }

  if (!article) notFound();

  return <BlogArticleContent article={article} />;
}
