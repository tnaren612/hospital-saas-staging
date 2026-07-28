"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPackages } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";

export function PackagesContent() {
  const packages = getPackages();
  const { t } = useLocale();

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="packages"
        title="Health Packages"
        subtitle="Preventive and recovery-focused packages for better lung health."
      />

      <Section>
        <SectionHeader
          badge="Value Care"
          title="Choose Your Package"
          subtitle="Transparent pricing with specialist consultation included."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {packages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className={`relative h-full overflow-hidden ${
                  pkg.popular ? "border-primary-400 shadow-lift ring-2 ring-primary-200 dark:ring-primary-900" : ""
                }`}
              >
                {pkg.popular && (
                  <div className="absolute right-4 top-4">
                    <Badge className="gap-1">
                      <Sparkles className="h-3 w-3" /> Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 md:p-8">
                  <h2 className="text-2xl font-bold">{pkg.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>
                  <div className="mt-5 flex items-end gap-3">
                    <span className="text-3xl font-bold text-primary-700 dark:text-primary-300">
                      {formatCurrency(pkg.price)}
                    </span>
                    {pkg.originalPrice && (
                      <span className="pb-1 text-sm text-muted-foreground line-through">
                        {formatCurrency(pkg.originalPrice)}
                      </span>
                    )}
                  </div>
                  <ul className="mt-6 space-y-2.5">
                    {pkg.includes.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/appointment" className="mt-8 inline-block">
                    <Button className="w-full sm:w-auto">{t.common.bookAppointment}</Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>
    </div>
  );
}
