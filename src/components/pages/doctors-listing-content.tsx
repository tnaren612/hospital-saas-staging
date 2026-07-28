"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search,
  Stethoscope,
  ArrowRight,
  CircleDot,
  GraduationCap,
  Briefcase,
} from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import {
  isDoctorAvailableToday,
  type PublicDoctor,
} from "@/lib/doctors/service";
import { formatCurrency, cn } from "@/lib/utils";


export function DoctorsListingContent({
  doctors,
  departments,
}: {
  doctors: PublicDoctor[];
  departments: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [specialization, setSpecialization] = useState<string>("all");
  const [sort, setSort] = useState<"featured" | "name">("featured");

  const specializations = useMemo(() => {
    const set = new Set<string>();
    doctors.forEach((d) => d.specializations.forEach((s) => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [doctors]);

  const filtered = useMemo(() => {
    let rows = [...doctors];
    if (departmentId !== "all") {
      rows = rows.filter((d) => d.department_id === departmentId);
    }
    if (specialization !== "all") {
      rows = rows.filter((d) =>
        d.specializations.some(
          (s) => s.toLowerCase() === specialization.toLowerCase()
        )
      );
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (d) =>
          d.name.toLowerCase().includes(needle) ||
          d.title.toLowerCase().includes(needle) ||
          d.specializations.some((s) => s.toLowerCase().includes(needle))
      );
    }
    if (sort === "name") {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      rows.sort((a, b) => {
        if (Boolean(a.is_featured) !== Boolean(b.is_featured)) {
          return a.is_featured ? -1 : 1;
        }
        return (
          (a.sort_order || 0) - (b.sort_order || 0) ||
          a.name.localeCompare(b.name)
        );
      });
    }
    return rows;
  }, [doctors, departmentId, specialization, q, sort]);

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="doctors"
        title="Our Doctors"
        subtitle="Meet our specialists — filter by department, specialization, or search by name."
      />

      <Section>
        <div className="mb-8 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search doctors, specialties…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search doctors"
            />
          </div>
          <select
            className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
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
            className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            aria-label="Filter by specialization"
          >
            <option value="all">All specializations</option>
            {specializations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {filtered.length} doctor{filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {(
              [
                ["featured", "Featured first"],
                ["name", "A–Z"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={cn(
                  "min-h-10 rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation",
                  sort === key
                    ? "bg-primary-600 text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
            <Stethoscope className="mx-auto mb-3 h-8 w-8 opacity-50" />
            No doctors match your filters.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doctor, i) => (
              <motion.div
                key={doctor.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
              >
                <DoctorCard doctor={doctor} />
              </motion.div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function DoctorCard({ doctor }: { doctor: PublicDoctor }) {
  const online = isDoctorAvailableToday(doctor);
  const href = `/doctors/${doctor.slug || doctor.id}`;
  // Same gallery doctor photo as Home DoctorPreview (uploaded lead-specialist.png)
  // doctor.photo_url via fallbackDoctor → /images/doctors/lead-specialist.png
  const DOCTOR_GALLERY_PHOTO = "/images/doctors/lead-specialist.png";
  const profileSrc =
    (doctor.photo_url &&
    !doctor.photo_url.toLowerCase().endsWith(".svg")
      ? doctor.photo_url
      : null) || DOCTOR_GALLERY_PHOTO;
  const bannerSrc = profileSrc;
  const degrees: string[] =
    doctor.degrees && doctor.degrees.length > 0
      ? doctor.degrees
      : doctor.qualifications || [];

  return (
    <Card className="group h-full overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
      <div className="relative h-24 overflow-hidden bg-muted sm:h-28">
        <Image
          src={bannerSrc}
          alt=""
          fill
          className="object-cover object-center transition duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 33vw"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {doctor.is_featured ? <Badge variant="teal">Featured</Badge> : null}
          <Badge
            className={
              online ? "bg-emerald-600 text-white" : "bg-slate-700 text-white"
            }
          >
            <CircleDot className="mr-1 h-3 w-3" aria-hidden />
            {online ? "Available today" : "Check schedule"}
          </Badge>
        </div>
      </div>

      {/* Profile photo — gallery image shared with Home Lead Specialist */}
      <div className="relative z-10 -mt-12 flex justify-center px-5">
        <div className="relative h-24 w-24 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-lift sm:h-28 sm:w-28">
          <Image
            src={profileSrc}
            alt={`Photo of ${doctor.name}`}
            fill
            className="object-cover object-top"
            sizes="112px"
          />
        </div>
      </div>

      <CardContent className="space-y-3 p-5 pt-3">
        <div className="text-center sm:text-left">
          <h2 className="text-lg font-semibold leading-snug">{doctor.name}</h2>
          <p className="text-sm text-muted-foreground">{doctor.title}</p>
          {doctor.department_name ? (
            <p className="mt-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              {doctor.department_name}
            </p>
          ) : null}
        </div>

        {degrees.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {degrees.slice(0, 4).map((q) => (
              <Badge key={q} variant="secondary" className="gap-1 text-[10px]">
                <GraduationCap className="h-3 w-3" aria-hidden />
                {q}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {doctor.specializations.slice(0, 4).map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" aria-hidden />
            {doctor.experience_years
              ? `${doctor.experience_years}+ yrs experience`
              : "Specialist consultant"}
          </span>
          <span className="font-medium">
            {doctor.consultation_fee
              ? formatCurrency(doctor.consultation_fee)
              : ""}
          </span>
        </div>

        <div className="flex flex-col gap-2 pt-1 min-[400px]:flex-row">
          <Link href={href} className="flex-1">
            <Button
              variant="outline"
              className="w-full min-h-11"
              size="sm"
              aria-label={`View profile of ${doctor.name}`}
            >
              View Profile <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link
            href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`}
            className="flex-1"
          >
            <Button
              className="w-full min-h-11"
              size="sm"
              aria-label={`Book appointment with ${doctor.name}`}
            >
              Book Appointment
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
