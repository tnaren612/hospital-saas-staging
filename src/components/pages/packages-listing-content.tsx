"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Sparkles, ArrowRight, Package } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartImage } from "@/components/ui/smart-image";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import {
  PACKAGE_TYPES,
  packageBookingHref,
  packageDisplayPrice,
  packageHasDiscount,
  type HealthPackageRecord,
} from "@/lib/health-packages/types";
import { formatCurrency, cn } from "@/lib/utils";

export function PackagesListingContent({
  packages,
  departments,
}: {
  packages: HealthPackageRecord[];
  departments: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [packageType, setPackageType] = useState("all");
  const [priceBand, setPriceBand] = useState<"all" | "lt2k" | "2to5" | "gt5">(
    "all"
  );
  const [show, setShow] = useState<"all" | "featured" | "popular">("all");

  const filtered = useMemo(() => {
    let rows = [...packages];
    if (departmentId !== "all") {
      rows = rows.filter((p) => p.department_id === departmentId);
    }
    if (packageType !== "all") {
      rows = rows.filter((p) => p.package_type === packageType);
    }
    if (show === "featured") rows = rows.filter((p) => p.featured);
    if (show === "popular") rows = rows.filter((p) => p.popular);
    if (priceBand !== "all") {
      rows = rows.filter((p) => {
        const price = packageDisplayPrice(p);
        if (priceBand === "lt2k") return price < 2000;
        if (priceBand === "2to5") return price >= 2000 && price <= 5000;
        return price > 5000;
      });
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.short_description.toLowerCase().includes(needle) ||
          p.package_type.toLowerCase().includes(needle) ||
          (p.department_name || "").toLowerCase().includes(needle)
      );
    }
    rows.sort(
      (a, b) =>
        (a.display_order || 0) - (b.display_order || 0) ||
        a.name.localeCompare(b.name)
    );
    return rows;
  }, [packages, departmentId, packageType, priceBand, show, q]);

  const featured = packages.filter((p) => p.featured).slice(0, 3);

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="packages"
        title="Health Packages"
        subtitle="Preventive, respiratory, executive, and senior care packages — fully managed by our hospital CMS."
      />

      {featured.length > 0 && (
        <Section className="pb-0">
          <SectionHeader
            badge="Featured"
            title="Recommended packages"
            subtitle="Highlighted packages for common patient needs."
          />
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            {featured.map((pkg) => (
              <Link key={pkg.id} href={`/health-packages/${pkg.slug}`}>
                <Card className="h-full overflow-hidden transition hover:shadow-lift">
                  <div className="relative aspect-[16/9]">
                    <SmartImage
                      src={pkg.hero_image || pkg.banner_image || pkg.icon}
                      alt={pkg.name}
                      fill
                      fallbackLabel={pkg.name}
                    />
                  </div>
                  <CardContent className="p-4">
                    <p className="font-semibold">{pkg.name}</p>
                    <p className="mt-1 text-sm text-primary-700 dark:text-primary-300">
                      {formatCurrency(packageDisplayPrice(pkg))}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section>
        <div className="mb-8 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search packages…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search health packages"
            />
          </div>
          <select
            className="flex h-11 rounded-xl border border-input bg-background px-3 text-sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className="flex h-11 rounded-xl border border-input bg-background px-3 text-sm"
            value={packageType}
            onChange={(e) => setPackageType(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {PACKAGE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className="flex h-11 rounded-xl border border-input bg-background px-3 text-sm"
            value={priceBand}
            onChange={(e) =>
              setPriceBand(e.target.value as typeof priceBand)
            }
            aria-label="Filter by price"
          >
            <option value="all">Any price</option>
            <option value="lt2k">Under ₹2,000</option>
            <option value="2to5">₹2,000 – ₹5,000</option>
            <option value="gt5">Above ₹5,000</option>
          </select>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["featured", "Featured"],
              ["popular", "Popular"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setShow(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                show === key
                  ? "bg-primary-600 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <span className="self-center text-xs text-muted-foreground">
            {filtered.length} package{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-3 h-8 w-8 opacity-50" />
            No packages match your filters.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {filtered.map((pkg, i) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
              >
                <Card
                  className={cn(
                    "relative h-full overflow-hidden",
                    pkg.popular &&
                      "border-primary-400 shadow-lift ring-2 ring-primary-200 dark:ring-primary-900"
                  )}
                >
                  <div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-1">
                    {pkg.popular && (
                      <Badge className="gap-1">
                        <Sparkles className="h-3 w-3" /> Popular
                      </Badge>
                    )}
                    {pkg.featured && <Badge variant="teal">Featured</Badge>}
                    {packageHasDiscount(pkg) && (
                      <Badge variant="secondary">Offer</Badge>
                    )}
                  </div>
                  {(pkg.hero_image || pkg.banner_image) && (
                    <div className="relative aspect-[21/9]">
                      <SmartImage
                        src={pkg.hero_image || pkg.banner_image}
                        alt={pkg.name}
                        fill
                        fallbackLabel={pkg.name}
                      />
                    </div>
                  )}
                  <CardContent className="p-6 md:p-8">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {pkg.package_type}
                      {pkg.department_name ? ` · ${pkg.department_name}` : ""}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">{pkg.name}</h2>
                    {pkg.subtitle ? (
                      <p className="mt-1 text-sm text-primary-700 dark:text-primary-300">
                        {pkg.subtitle}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-muted-foreground">
                      {pkg.short_description || pkg.description}
                    </p>
                    <div className="mt-5 flex items-end gap-3">
                      <span className="text-3xl font-bold text-primary-700 dark:text-primary-300">
                        {formatCurrency(packageDisplayPrice(pkg))}
                      </span>
                      {packageHasDiscount(pkg) && (
                        <span className="pb-1 text-sm text-muted-foreground line-through">
                          {formatCurrency(pkg.price)}
                        </span>
                      )}
                    </div>
                    {pkg.duration || pkg.report_time ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {[pkg.duration, pkg.report_time && `Reports: ${pkg.report_time}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <ul className="mt-5 space-y-1.5">
                      {(pkg.tests_included.length
                        ? pkg.tests_included
                        : pkg.services_included
                      )
                        .slice(0, 4)
                        .map((item) => (
                          <li
                            key={item}
                            className="text-sm text-muted-foreground"
                          >
                            • {item}
                          </li>
                        ))}
                    </ul>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Link href={`/health-packages/${pkg.slug}`}>
                        <Button variant="outline">
                          View details <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {pkg.booking_enabled ? (
                        <Link href={packageBookingHref(pkg)}>
                          <Button
                            data-analytics="book-package"
                            data-package={pkg.slug}
                          >
                            Book package
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
