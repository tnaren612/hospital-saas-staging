"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { formatDate, cn } from "@/lib/utils";
import type { ArticleCategory, BlogArticle } from "@/types";

const categories: Array<"all" | ArticleCategory> = [
  "all",
  "lungs",
  "asthma",
  "covid",
  "copd",
  "general",
];

export function BlogContent({ articles }: { articles: BlogArticle[] }) {
  const [filter, setFilter] = useState<"all" | ArticleCategory>("all");

  const filtered = useMemo(
    () =>
      filter === "all"
        ? articles
        : articles.filter((a) => a.category === filter),
    [articles, filter]
  );

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="blog"
        title="Health Tips"
        subtitle="Practical respiratory health guidance from our clinical team."
      />

      <Section>
        <div className="mb-8 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold capitalize",
                filter === c
                  ? "bg-primary-600 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {c === "all" ? "All" : c.replace("-", " ")}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground">
            No health tips published yet. Check back soon.
          </p>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((article, i) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
            >
              <Link href={`/blog/${article.slug}`}>
                <Card className="h-full overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                  <div className="relative aspect-[16/10]">
                    <SmartImage
                      src={article.coverImage}
                      alt={article.title}
                      fill
                      fallbackLabel={article.category}
                    />
                  </div>
                  <CardContent className="p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="teal" className="capitalize">
                        {article.category}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {article.readTime} min
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold leading-snug">
                      {article.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {article.excerpt}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDate(article.publishedAt)}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-primary-700 dark:text-primary-300">
                        Read <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </Section>
    </div>
  );
}
