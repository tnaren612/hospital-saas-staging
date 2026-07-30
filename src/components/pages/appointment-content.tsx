"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Section, SectionHeader } from "@/components/ui/section";
import { AppointmentForm } from "@/components/appointment/appointment-form";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { useLocale } from "@/hooks/use-locale";

/** Calendar is secondary — load after form is interactive */
const DoctorCalendar = dynamic(
  () =>
    import("@/components/appointment/doctor-calendar").then(
      (m) => m.DoctorCalendar
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-3xl border bg-muted/40" />
    ),
  }
);

export function AppointmentContent() {
  const { t } = useLocale();

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="appointment"
        title={t.appointment.title}
        subtitle={t.appointment.subtitle}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <SectionHeader
              align="left"
              badge="Secure Booking"
              title="Patient Appointment Form"
              subtitle="Validated patient booking with department, doctor, slots, and optional health package context."
              className="mb-8"
            />
            <Suspense
              fallback={
                <div className="rounded-3xl border p-8 text-sm text-muted-foreground">
                  Loading booking form…
                </div>
              }
            >
              <AppointmentForm defaultType="in-person" />
            </Suspense>
          </div>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <DoctorCalendar />
          </div>
        </div>
      </Section>
    </div>
  );
}
