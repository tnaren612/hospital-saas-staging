"use client";

import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { Section } from "@/components/ui/section";
import { useCmsPage } from "@/hooks/use-cms-page";
import type { CmsPageKey } from "@/lib/cms/types";

export function CmsPageRenderer({
  pageKey,
  fallback,
}: {
  pageKey: CmsPageKey;
  fallback: React.ReactNode;
}) {
  const { page, loading } = useCmsPage(pageKey);
  const cmsRequired = process.env.NEXT_PUBLIC_USE_SUPABASE === "true";

  if (loading && cmsRequired) {
    return (
      <div className="container mx-auto px-4 py-24 text-center text-sm text-muted-foreground">
        Loading page content…
      </div>
    );
  }

  if (!page) {
    if (!cmsRequired) return <>{fallback}</>;
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Content unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page has not been published by the hospital administrator.
        </p>
      </div>
    );
  }

  const hero = page.content.blocks.find((block) => block.type === "hero");
  const bodyBlocks = page.content.blocks.filter(
    (block) => block.type !== "hero" && block.body
  );

  return (
    <div className="page-enter">
      <CmsPageBanner
        section={pageKey}
        title={hero?.title || page.title}
        subtitle={hero?.subtitle}
      />
      <Section>
        <article className="prose prose-slate mx-auto max-w-4xl dark:prose-invert">
          {bodyBlocks.length ? (
            bodyBlocks.map((block) => (
              <section key={block.id} className="mb-8">
                {block.title && <h2>{block.title}</h2>}
                {block.subtitle && <p className="lead">{block.subtitle}</p>}
                <div className="whitespace-pre-wrap">{block.body}</div>
              </section>
            ))
          ) : (
            <p>Content will be published by the hospital administrator.</p>
          )}
        </article>
      </Section>
    </div>
  );
}
