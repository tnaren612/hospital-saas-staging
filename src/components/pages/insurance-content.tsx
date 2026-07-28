"use client";

import { motion } from "framer-motion";
import { Shield, FileCheck, Phone } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { getInsurance, getHospital } from "@/lib/data";
import { formatPhone, getTelUrl } from "@/lib/utils";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";

export function InsuranceContent() {
  const partners = getInsurance();
  const hospital = getHospital();

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="insurance"
        title="Insurance Partners"
        subtitle="We support major health insurance providers. Coverage depends on your policy terms."
      />

      <Section>
        <SectionHeader
          badge="Partners"
          title="Accepted Insurance Networks"
          subtitle="Our team can help with documentation and pre-authorization guidance."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950">
                    <Shield className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>

      <Section className="bg-muted/40">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <FileCheck className="mb-3 h-8 w-8 text-teal" />
              <h3 className="text-xl font-semibold">How Claims Work</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>1. Share your insurance card and policy details at reception.</li>
                <li>2. Our desk assists with pre-authorization where applicable.</li>
                <li>3. Final settlement depends on insurer approval and policy coverage.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Phone className="mb-3 h-8 w-8 text-primary-600" />
              <h3 className="text-xl font-semibold">Need Help?</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Call our insurance desk for guidance before planned admissions.
              </p>
              <a
                href={getTelUrl(hospital.phones[0])}
                className="mt-4 inline-flex font-semibold text-primary-700 dark:text-primary-300"
              >
                {formatPhone(hospital.phones[0])}
              </a>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  );
}
