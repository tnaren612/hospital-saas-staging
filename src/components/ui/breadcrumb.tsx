import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

/** Accessible breadcrumb trail + optional JSON-LD via parent page. */
export function Breadcrumb({ items, className }: Props) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-6", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground sm:text-sm">
        <li className="inline-flex items-center">
          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 py-1 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
        </li>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="min-h-9 rounded-md px-1 py-1 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="px-1 py-1 font-medium text-foreground"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function breadcrumbJsonLd(
  items: BreadcrumbItem[],
  siteUrl: string
) {
  const base = siteUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: base,
      },
      ...items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: item.label,
        ...(item.href
          ? { item: `${base}${item.href.startsWith("/") ? item.href : `/${item.href}`}` }
          : {}),
      })),
    ],
  };
}
