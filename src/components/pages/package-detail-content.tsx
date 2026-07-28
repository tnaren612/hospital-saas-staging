"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Stethoscope,
} from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SmartImage } from "@/components/ui/smart-image";
import {
  packageBookingHref,
  packageDisplayPrice,
  packageHasDiscount,
  type HealthPackageRecord,
} from "@/lib/health-packages/types";
import type { PublicDoctor } from "@/lib/doctors/service";
import { formatCurrency } from "@/lib/utils";

export function PackageDetailContent({
  pkg,
  related,
  doctors,
}: {
  pkg: HealthPackageRecord;
  related: HealthPackageRecord[];
  doctors: PublicDoctor[];
}) {
  const hero = pkg.hero_image || pkg.banner_image;

  return (
    <div className="page-enter">
      <div className="border-b bg-muted/30">
        <nav
          aria-label="Breadcrumb"
          className="container mx-auto flex flex-wrap items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8"
        >
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href="/health-packages" className="hover:text-foreground">
            Health Packages
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="font-medium text-foreground">{pkg.name}</span>
        </nav>
      </div>

      <section className="relative overflow-hidden bg-hero-gradient py-14 text-white md:py-18">
        {hero ? (
          <>
            <div className="absolute inset-0">
              <SmartImage
                src={hero}
                alt={pkg.name}
                fill
                className="object-cover"
                priority
              />
            </div>
            <div className="absolute inset-0 bg-primary-950/75" />
          </>
        ) : (
          <div className="absolute inset-0 bg-mesh opacity-40" />
        )}
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge className="bg-white/15 text-white capitalize">
                {pkg.package_type}
              </Badge>
              {pkg.department_name ? (
                <Badge className="bg-white/15 text-white">
                  {pkg.department_name}
                </Badge>
              ) : null}
              {pkg.popular ? (
                <Badge className="bg-amber-400 text-amber-950">Popular</Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-bold md:text-5xl">{pkg.name}</h1>
            {pkg.subtitle ? (
              <p className="mt-3 text-lg text-white/85">{pkg.subtitle}</p>
            ) : null}
            <p className="mt-4 text-white/80">
              {pkg.short_description || pkg.description}
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-3">
              <span className="text-4xl font-bold">
                {formatCurrency(packageDisplayPrice(pkg))}
              </span>
              {packageHasDiscount(pkg) ? (
                <span className="pb-1 text-white/60 line-through">
                  {formatCurrency(pkg.price)}
                </span>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {pkg.booking_enabled ? (
                <Link
                  href={packageBookingHref(pkg)}
                  data-analytics="book-package"
                  data-package={pkg.slug}
                >
                  <Button
                    size="lg"
                    className="bg-white text-primary-800 hover:bg-white/90"
                  >
                    Book this package
                  </Button>
                </Link>
              ) : null}
              {pkg.brochure_pdf ? (
                <a
                  href={pkg.brochure_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-analytics="brochure-download"
                  data-package={pkg.slug}
                >
                  <Button size="lg" variant="glass">
                    <Download className="h-4 w-4" /> Brochure PDF
                  </Button>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-10">
            <div>
              <h2 className="text-2xl font-bold">Overview</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground whitespace-pre-line">
                {pkg.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {pkg.duration ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> {pkg.duration}
                  </span>
                ) : null}
                {pkg.report_time ? (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Reports: {pkg.report_time}
                  </span>
                ) : null}
              </div>
            </div>

            {pkg.tests_included.length > 0 && (
              <ListBlock title="Tests included" items={pkg.tests_included} />
            )}
            {pkg.services_included.length > 0 && (
              <ListBlock
                title="Services included"
                items={pkg.services_included}
              />
            )}
            {pkg.benefits.length > 0 && (
              <ListBlock title="Benefits" items={pkg.benefits} />
            )}
            {pkg.preparation && (
              <div>
                <h3 className="mb-3 text-xl font-semibold">Preparation</h3>
                <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
                  {pkg.preparation}
                </p>
              </div>
            )}
            {pkg.instructions.length > 0 && (
              <ListBlock title="Instructions" items={pkg.instructions} />
            )}

            {pkg.gallery_images.length > 0 && (
              <div>
                <h3 className="mb-4 text-xl font-semibold">Gallery</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {pkg.gallery_images.map((src, i) => (
                    <div
                      key={`${src}-${i}`}
                      className="relative aspect-square overflow-hidden rounded-2xl"
                    >
                      <SmartImage
                        src={src}
                        alt={`${pkg.name} gallery ${i + 1}`}
                        fill
                        fallbackLabel="Gallery"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pkg.faqs.length > 0 && (
              <div>
                <h3 className="mb-4 text-xl font-semibold">FAQs</h3>
                <div className="space-y-3">
                  {pkg.faqs.map((f) => (
                    <Card key={f.question}>
                      <CardContent className="p-4">
                        <p className="font-medium">{f.question}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {f.answer}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardContent className="space-y-4 p-5">
                <h3 className="font-semibold">Book package</h3>
                <p className="text-3xl font-bold text-primary-700 dark:text-primary-300">
                  {formatCurrency(packageDisplayPrice(pkg))}
                </p>
                {pkg.booking_enabled ? (
                  <Link href={packageBookingHref(pkg)} className="block">
                    <Button className="w-full">Book appointment</Button>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Online booking is currently disabled for this package.
                    Please call the hospital.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Payment gateway (Razorpay / Stripe) ready for future release —
                  booking uses the existing appointment module today.
                </p>
              </CardContent>
            </Card>

            {pkg.department_name && (
              <Card>
                <CardContent className="p-5 text-sm">
                  <h3 className="font-semibold">Department</h3>
                  <p className="mt-2 text-muted-foreground">
                    {pkg.department_name}
                  </p>
                  {pkg.department_id ? (
                    <Link
                      href={`/doctors?department=${pkg.department_id}`}
                      className="mt-3 inline-block text-primary-700 underline dark:text-primary-300"
                    >
                      View related doctors
                    </Link>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {doctors.length > 0 && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Stethoscope className="h-4 w-4 text-primary-600" />
                    Related doctors
                  </h3>
                  {doctors.map((d) => (
                    <Link
                      key={d.id}
                      href={`/doctors/${d.slug || d.id}`}
                      className="flex items-center gap-3 rounded-xl border p-2 hover:bg-muted/50"
                    >
                      <div className="relative h-12 w-12 overflow-hidden rounded-lg">
                        <SmartImage
                          src={d.photo_url || ""}
                          alt={d.name}
                          fill
                          fallbackLabel={d.name}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.title}
                        </p>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </Section>

      {related.length > 0 && (
        <Section className="bg-muted/30">
          <h2 className="mb-6 text-2xl font-bold">Related packages</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.id} href={`/health-packages/${r.slug}`}>
                <Card className="h-full transition hover:shadow-lift">
                  <CardContent className="p-4">
                    <p className="font-semibold">{r.name}</p>
                    <p className="mt-1 text-sm text-primary-700 dark:text-primary-300">
                      {formatCurrency(packageDisplayPrice(r))}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-3 text-xl font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
