"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import {
  Briefcase,
  MapPin,
  Clock,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import careersJson from "@/data/careers.json";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";
import { cn, formatDate } from "@/lib/utils";

type Job = (typeof careersJson)[number];

const applySchema = z.object({
  fullName: z.string().min(2, "Name is required").max(80),
  email: z.string().email("Valid email required"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile required"),
  experienceYears: z.coerce.number().min(0).max(50).optional(),
  coverNote: z.string().min(20, "Please share at least 20 characters").max(2000),
  resumeUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

type ApplyValues = z.infer<typeof applySchema>;

export function CareersContent() {
  const { config } = useHospitalConfig();
  const jobs = careersJson as Job[];
  const [openId, setOpenId] = useState<string | null>(jobs[0]?.id ?? null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: { resumeUrl: "" },
  });

  const activeJob = jobs.find((j) => j.id === applyingId);

  const onSubmit = async (values: ApplyValues) => {
    if (!activeJob) return;
    try {
      const res = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: activeJob.id,
          jobTitle: activeJob.title,
          ...values,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Application failed");
      toast.success(json.message || "Application submitted");
      reset();
      setApplyingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    }
  };

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="careers"
        title="Careers"
        subtitle={`Join ${config.branding.name} — build a career in compassionate care.`}
      />
      <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: "Careers" }]} />
      </div>

      <Section>
        <SectionHeader
          badge="We're hiring"
          title="Open positions"
          subtitle="Apply online. Our HR team reviews every application carefully."
        />

        {jobs.length === 0 ? (
          <EmptyState
            title="No openings right now"
            description="Please check back later or send your resume via the Contact page."
            actionLabel="Contact us"
            actionHref="/contact"
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {jobs.map((job) => {
              const open = openId === job.id;
              return (
                <Card key={job.id} className="overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5 touch-manipulation min-h-14"
                    onClick={() => setOpenId(open ? null : job.id)}
                    aria-expanded={open}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {job.title}
                        </h3>
                        <Badge variant="teal">{job.type}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5" aria-hidden />
                          {job.department}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden />
                          {job.location}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          Posted {formatDate(job.postedAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition",
                        open && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>
                  {open && (
                    <CardContent className="border-t border-border px-4 pb-5 pt-0 sm:px-5">
                      <p className="mt-4 text-sm text-muted-foreground">
                        {job.summary}
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold">Requirements</h4>
                          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                            {job.requirements.map((r) => (
                              <li key={r} className="flex gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-600" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">
                            Responsibilities
                          </h4>
                          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                            {job.responsibilities.map((r) => (
                              <li key={r} className="flex gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <Button
                        className="mt-5 min-h-11 w-full sm:w-auto"
                        onClick={() => setApplyingId(job.id)}
                      >
                        Apply for this role
                      </Button>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {applyingId && activeJob && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-title"
          onClick={() => setApplyingId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-lift sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="apply-title" className="text-lg font-bold">
              Apply — {activeJob.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We will contact shortlisted candidates by phone or email.
            </p>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-5 space-y-4"
              noValidate
            >
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" className="mt-1.5" {...register("fullName")} />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-emergency">
                    {errors.fullName.message}
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    className="mt-1.5"
                    maxLength={10}
                    {...register("phone")}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-xs text-emergency">
                      {errors.phone.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    className="mt-1.5"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-emergency">
                      {errors.email.message}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="experienceYears">Years of experience</Label>
                <Input
                  id="experienceYears"
                  type="number"
                  min={0}
                  className="mt-1.5"
                  {...register("experienceYears")}
                />
              </div>
              <div>
                <Label htmlFor="coverNote">Cover note</Label>
                <Textarea
                  id="coverNote"
                  rows={4}
                  className="mt-1.5"
                  {...register("coverNote")}
                />
                {errors.coverNote && (
                  <p className="mt-1 text-xs text-emergency">
                    {errors.coverNote.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="resumeUrl">Resume URL (optional)</Label>
                <Input
                  id="resumeUrl"
                  className="mt-1.5"
                  placeholder="https://drive.google.com/..."
                  {...register("resumeUrl")}
                />
                {errors.resumeUrl && (
                  <p className="mt-1 text-xs text-emergency">
                    {errors.resumeUrl.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-11 flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                    </>
                  ) : (
                    "Submit application"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setApplyingId(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
