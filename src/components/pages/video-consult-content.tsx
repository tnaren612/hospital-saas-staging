"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Video, Shield, Clock, MonitorSmartphone } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppointmentForm } from "@/components/appointment/appointment-form";
import { getDoctor } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

export function VideoConsultContent() {
  const doctor = getDoctor();

  return (
    <div className="page-enter">
      <section className="bg-hero-gradient py-16 text-white md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold md:text-5xl">Video Consultation</h1>
          <p className="mt-4 max-w-2xl text-white/80">
            Secure telemedicine with {doctor.name}. Demo meeting room included —
            fee {formatCurrency(doctor.videoConsultationFee)}.
          </p>
          <div className="mt-6">
            <Link href="/video-consult/meeting">
              <Button size="lg" className="bg-white text-primary-800 hover:bg-white/90">
                <Video className="h-5 w-5" /> Join Demo Meeting
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Section className="bg-muted/40">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Shield,
              title: "Private by Design",
              desc: "Demo UI for secure consults — connect real WebRTC later.",
            },
            {
              icon: Clock,
              title: "Flexible Slots",
              desc: "Morning, afternoon, and evening video slots available.",
            },
            {
              icon: MonitorSmartphone,
              title: "Works Anywhere",
              desc: "Join from phone or desktop with camera and mic controls.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="p-6">
                <item.icon className="mb-3 h-8 w-8 text-primary-600" />
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeader
          align="left"
          badge="Book Video Visit"
          title="Schedule a Video Consultation"
          subtitle="Same appointment engine — type set to video."
        />
        <Suspense
          fallback={
            <div className="rounded-3xl border p-8 text-sm text-muted-foreground">
              Loading booking form…
            </div>
          }
        >
          <AppointmentForm defaultType="video" />
        </Suspense>
      </Section>
    </div>
  );
}
