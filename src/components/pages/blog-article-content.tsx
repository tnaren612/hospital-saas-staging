import Link from "next/link";
import { ArrowLeft, Clock, User } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { formatDate } from "@/lib/utils";
import type { BlogArticle } from "@/types";

export function BlogArticleContent({ article }: { article: BlogArticle }) {
  const paragraphs = article.content.split("\n").filter(Boolean);

  return (
    <div className="page-enter">
      <Section className="pt-10">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Health Tips
        </Link>

        <article className="mx-auto max-w-3xl">
          <Badge variant="teal" className="mb-4 capitalize">
            {article.category}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {article.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {article.author}
            </span>
            <span>{formatDate(article.publishedAt)}</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {article.readTime} min read
            </span>
          </div>

          <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-3xl">
            <SmartImage
              src={article.coverImage}
              alt={article.title}
              fill
              priority
              fallbackLabel={article.title}
            />
          </div>

          <div className="prose-custom mt-10 space-y-4">
            {paragraphs.map((line, i) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={i} className="pt-4 text-2xl font-bold">
                    {line.replace("## ", "")}
                  </h2>
                );
              }
              if (line.startsWith("### ")) {
                return (
                  <h3 key={i} className="pt-2 text-xl font-semibold">
                    {line.replace("### ", "")}
                  </h3>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <li key={i} className="ml-5 list-disc text-muted-foreground">
                    {line.replace("- ", "")}
                  </li>
                );
              }
              if (/^\d+\.\s/.test(line)) {
                return (
                  <li
                    key={i}
                    className="ml-5 list-decimal text-muted-foreground"
                  >
                    {line.replace(/^\d+\.\s/, "")}
                  </li>
                );
              }
              return (
                <p key={i} className="leading-relaxed text-muted-foreground">
                  {line}
                </p>
              );
            })}
          </div>

          <div className="mt-10 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                #{tag}
              </Badge>
            ))}
          </div>
        </article>
      </Section>
    </div>
  );
}
