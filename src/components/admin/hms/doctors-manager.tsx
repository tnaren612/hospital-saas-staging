"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Loader2, Upload, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui/page-header";
import { TableSkeleton } from "@/components/admin/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import { uploadGalleryImage } from "@/lib/gallery/admin-service";
import {
  WEEK_DAYS,
  type Department,
  type HospitalDoctor,
} from "@/lib/hms/types";
import { formatCurrency } from "@/lib/utils";
import {
  CONSULTATION_TYPES,
  SPECIALIZATION_CATALOG,
} from "@/lib/doctors/constants";

const emptyForm = {
  name: "",
  title: "Consultant",
  slug: "",
  department_id: "",
  photo_url: "",
  qualifications: "MBBS",
  degrees: "",
  certifications: "",
  specializations: "Pulmonology",
  experience_years: "5",
  experience_notes: "",
  experience_timeline: "",
  awards: "",
  memberships: "",
  languages: "English, Telugu",
  treatments: "",
  services: "",
  faqs_text: "",
  consultation_fee: "500",
  video_consultation_fee: "400",
  consultation_types: ["in_person", "video"] as string[],
  available_days: ["mon", "tue", "wed", "thu", "fri", "sat"] as string[],
  time_slots: "09:00 AM, 10:00 AM, 11:00 AM, 05:00 PM, 06:00 PM",
  consultation_timings: "Mon–Sat · 9:00 AM – 8:00 PM",
  biography: "",
  video_intro_url: "",
  is_featured: false,
  seo_title: "",
  seo_description: "",
  status: "active" as "active" | "inactive",
};

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitLines(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseFaqs(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [q, ...rest] = line.split("|");
      return {
        question: (q || "").trim(),
        answer: rest.join("|").trim(),
      };
    })
    .filter((f) => f.question && f.answer);
}

export function DoctorsManager() {
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      if (deptFilter) params.department_id = deptFilter;
      const [dRes, depRes] = await Promise.all([
        hmsGet<{ data: HospitalDoctor[] }>("/api/admin/doctors", params),
        hmsGet<{ data: Department[] }>("/api/admin/departments"),
      ]);
      setDoctors(dRes.data || []);
      setDepartments(depRes.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load doctors");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, deptFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const startEdit = (d: HospitalDoctor) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      title: d.title,
      slug: d.slug || "",
      department_id: d.department_id || "",
      photo_url: d.photo_url || "",
      qualifications: (d.qualifications || []).join(", "),
      degrees: (d.degrees || []).join(", "),
      certifications: (d.certifications || []).join(", "),
      specializations: (d.specializations || []).join(", "),
      experience_years: String(d.experience_years ?? 0),
      experience_notes: d.experience_notes || "",
      experience_timeline: (d.experience_timeline || []).join("\n"),
      awards: (d.awards || []).join(", "),
      memberships: (d.memberships || []).join(", "),
      languages: (d.languages || []).join(", "),
      treatments: (d.treatments || []).join(", "),
      services: (d.services || []).join(", "),
      faqs_text: (d.faqs || [])
        .map((f) => `${f.question} | ${f.answer}`)
        .join("\n"),
      consultation_fee: String(d.consultation_fee ?? 500),
      video_consultation_fee: String(d.video_consultation_fee ?? 400),
      consultation_types: d.consultation_types?.length
        ? [...d.consultation_types]
        : ["in_person", "video"],
      available_days: d.available_days || [],
      time_slots: (d.time_slots || []).join(", "),
      consultation_timings: d.consultation_timings || "",
      biography: d.biography || "",
      video_intro_url: d.video_intro_url || "",
      is_featured: Boolean(d.is_featured),
      seo_title: d.seo_title || "",
      seo_description: d.seo_description || "",
      status: d.status || "active",
    });
    setOpen(true);
  };

  const onPhotoUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadGalleryImage({
        file,
        section: "doctor",
        key: "profile",
        title: form.name || "Doctor profile",
        alt_text: form.name || "Doctor profile photo",
        category: "doctor",
        sort_order: 0,
        is_active: true,
      });
      const url = uploaded.image_url || uploaded.public_url || "";
      setForm((f) => ({ ...f, photo_url: url }));
      toast.success("Photo uploaded via Gallery CMS");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        title: form.title,
        slug: form.slug || undefined,
        department_id: form.department_id || null,
        photo_url: form.photo_url || null,
        qualifications: splitCsv(form.qualifications),
        degrees: splitCsv(form.degrees || form.qualifications),
        certifications: splitCsv(form.certifications),
        specializations: splitCsv(form.specializations),
        experience_years: Number(form.experience_years) || 0,
        experience_notes: form.experience_notes,
        experience_timeline: splitLines(form.experience_timeline),
        awards: splitCsv(form.awards),
        memberships: splitCsv(form.memberships),
        languages: splitCsv(form.languages),
        treatments: splitCsv(form.treatments),
        services: splitCsv(form.services),
        faqs: parseFaqs(form.faqs_text),
        consultation_fee: Number(form.consultation_fee) || 0,
        video_consultation_fee: Number(form.video_consultation_fee) || 0,
        consultation_types:
          form.consultation_types.length > 0
            ? form.consultation_types
            : ["in_person"],
        available_days: form.available_days,
        time_slots: splitCsv(form.time_slots),
        consultation_timings: form.consultation_timings,
        biography: form.biography,
        video_intro_url: form.video_intro_url || null,
        is_featured: form.is_featured,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        status: form.status,
      };

      if (editingId) {
        await hmsMutate(`/api/admin/doctors/${editingId}`, "PATCH", payload);
        toast.success("Doctor profile updated");
      } else {
        await hmsMutate("/api/admin/doctors", "POST", payload);
        toast.success("Doctor added");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (
      !confirm(
        "Remove this doctor from the roster? (Soft delete — history is preserved.)"
      )
    )
      return;
    try {
      await hmsMutate(`/api/admin/doctors/${id}`, "DELETE");
      toast.success("Doctor removed from roster");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      available_days: f.available_days.includes(day)
        ? f.available_days.filter((d) => d !== day)
        : [...f.available_days, day],
    }));
  };

  const toggleConsultType = (value: string) => {
    setForm((f) => {
      const has = f.consultation_types.includes(value);
      if (has && f.consultation_types.length === 1) {
        toast.error("Select at least one consultation type");
        return f;
      }
      return {
        ...f,
        consultation_types: has
          ? f.consultation_types.filter((t) => t !== value)
          : [...f.consultation_types, value],
      };
    });
  };

  const addSpecialization = (spec: string) => {
    const current = splitCsv(form.specializations);
    if (current.includes(spec)) return;
    setForm((f) => ({
      ...f,
      specializations: [...current, spec].join(", "),
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctor Profile CMS"
        description="Roster, biography, qualifications, fees, timings, SEO — photos via Gallery CMS (section=doctor)"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4" /> Add Doctor
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="doctor-search" className="mb-1 block text-xs">
            Search
          </Label>
          <Input
            id="doctor-search"
            placeholder="Search name, specialty, slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search doctors"
          />
        </div>
        <div>
          <Label htmlFor="doctor-status" className="mb-1 block text-xs">
            Status
          </Label>
          <select
            id="doctor-status"
            className="flex h-11 min-w-[120px] rounded-xl border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <Label htmlFor="doctor-dept" className="mb-1 block text-xs">
            Department
          </Label>
          <select
            id="doctor-dept"
            className="flex h-11 min-w-[160px] rounded-xl border border-input bg-background px-3 text-sm"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {open && (
        <Card className="border-primary-200 shadow-lift dark:border-primary-900">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">
              {editingId ? "Edit Doctor Profile" : "Add Doctor"}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label="Public slug (/doctors/…)">
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="auto from name if empty"
                />
              </Field>
              <Field label="Department">
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                  value={form.department_id}
                  onChange={(e) =>
                    setForm({ ...form, department_id: e.target.value })
                  }
                >
                  <option value="">— None —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="md:col-span-2">
                <Label className="mb-2 block">
                  Profile photo (Gallery CMS · section=doctor · key=profile)
                </Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative h-20 w-20 overflow-hidden rounded-xl border">
                    <SmartImage
                      src={form.photo_url}
                      alt="Profile"
                      fill
                      fallbackLabel="Photo"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-2 text-sm font-medium hover:bg-muted/50">
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload photo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) =>
                          void onPhotoUpload(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <Input
                      value={form.photo_url}
                      onChange={(e) =>
                        setForm({ ...form, photo_url: e.target.value })
                      }
                      placeholder="Or paste public URL"
                    />
                  </div>
                </div>
              </div>

              <Field label="Qualifications (comma)">
                <Input
                  value={form.qualifications}
                  onChange={(e) =>
                    setForm({ ...form, qualifications: e.target.value })
                  }
                />
              </Field>
              <Field label="Degrees (comma)">
                <Input
                  value={form.degrees}
                  onChange={(e) =>
                    setForm({ ...form, degrees: e.target.value })
                  }
                />
              </Field>
              <Field label="Certifications (comma)">
                <Input
                  value={form.certifications}
                  onChange={(e) =>
                    setForm({ ...form, certifications: e.target.value })
                  }
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Specializations (comma-separated)">
                  <Input
                    value={form.specializations}
                    onChange={(e) =>
                      setForm({ ...form, specializations: e.target.value })
                    }
                  />
                </Field>
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested specializations">
                  {SPECIALIZATION_CATALOG.slice(0, 10).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSpecialization(s)}
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-primary-50 hover:text-primary-700"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block">Consultation types</Label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Consultation types">
                  {CONSULTATION_TYPES.map((t) => {
                    const on = form.consultation_types.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleConsultType(t.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          on
                            ? "bg-primary-600 text-white"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Languages (comma)">
                <Input
                  value={form.languages}
                  onChange={(e) =>
                    setForm({ ...form, languages: e.target.value })
                  }
                />
              </Field>
              <Field label="Awards (comma)">
                <Input
                  value={form.awards}
                  onChange={(e) =>
                    setForm({ ...form, awards: e.target.value })
                  }
                />
              </Field>
              <Field label="Memberships (comma)">
                <Input
                  value={form.memberships}
                  onChange={(e) =>
                    setForm({ ...form, memberships: e.target.value })
                  }
                />
              </Field>
              <Field label="Experience (years)">
                <Input
                  type="number"
                  value={form.experience_years}
                  onChange={(e) =>
                    setForm({ ...form, experience_years: e.target.value })
                  }
                />
              </Field>
              <Field label="Consultation fee (₹)">
                <Input
                  type="number"
                  value={form.consultation_fee}
                  onChange={(e) =>
                    setForm({ ...form, consultation_fee: e.target.value })
                  }
                />
              </Field>
              <Field label="Video consultation fee (₹)">
                <Input
                  type="number"
                  value={form.video_consultation_fee}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      video_consultation_fee: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Consultation timings">
                <Input
                  value={form.consultation_timings}
                  onChange={(e) =>
                    setForm({ ...form, consultation_timings: e.target.value })
                  }
                />
              </Field>
              <Field label="Video intro URL (optional)">
                <Input
                  value={form.video_intro_url}
                  onChange={(e) =>
                    setForm({ ...form, video_intro_url: e.target.value })
                  }
                  placeholder="https://youtube.com/..."
                />
              </Field>
              <Field label="Status">
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as "active" | "inactive",
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="featured"
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) =>
                    setForm({ ...form, is_featured: e.target.checked })
                  }
                  className="h-4 w-4 rounded border"
                />
                <Label htmlFor="featured">Featured doctor (listing highlight)</Label>
              </div>

              <div className="md:col-span-2">
                <Label className="mb-2 block">Weekly availability</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        form.available_days.includes(d.value)
                          ? "bg-primary-600 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave / holiday days: Admin → Availability (doctor_availability).
                </p>
              </div>

              <div className="md:col-span-2">
                <Field label="Time slots (comma)">
                  <Input
                    value={form.time_slots}
                    onChange={(e) =>
                      setForm({ ...form, time_slots: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Treatments (comma)">
                  <Input
                    value={form.treatments}
                    onChange={(e) =>
                      setForm({ ...form, treatments: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Services (comma)">
                  <Input
                    value={form.services}
                    onChange={(e) =>
                      setForm({ ...form, services: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Experience timeline (one per line)">
                  <Textarea
                    value={form.experience_timeline}
                    onChange={(e) =>
                      setForm({ ...form, experience_timeline: e.target.value })
                    }
                    className="min-h-[90px]"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Professional biography">
                  <Textarea
                    value={form.biography}
                    onChange={(e) =>
                      setForm({ ...form, biography: e.target.value })
                    }
                    className="min-h-[120px]"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="FAQs (one per line: Question | Answer)">
                  <Textarea
                    value={form.faqs_text}
                    onChange={(e) =>
                      setForm({ ...form, faqs_text: e.target.value })
                    }
                    className="min-h-[100px]"
                    placeholder="When should I visit? | If you have persistent cough..."
                  />
                </Field>
              </div>
              <Field label="SEO title">
                <Input
                  value={form.seo_title}
                  onChange={(e) =>
                    setForm({ ...form, seo_title: e.target.value })
                  }
                />
              </Field>
              <Field label="SEO description">
                <Input
                  value={form.seo_description}
                  onChange={(e) =>
                    setForm({ ...form, seo_description: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={saving || uploading}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save profile
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Doctor</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Fee</th>
                    <th className="px-4 py-3">Days</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No doctors yet. Run migration 004 / 008 and add a doctor.
                      </td>
                    </tr>
                  ) : (
                    doctors.map((d) => (
                      <tr key={d.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-full">
                              <SmartImage
                                src={d.photo_url || ""}
                                alt={d.name}
                                fill
                                fallbackLabel={d.name.slice(0, 1)}
                              />
                            </div>
                            <div>
                              <div className="font-medium">
                                {d.name}
                                {d.is_featured ? (
                                  <Badge className="ml-2" variant="teal">
                                    Featured
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {d.title}
                              </div>
                              {d.slug ? (
                                <div className="text-xs text-primary-700 dark:text-primary-300">
                                  /doctors/{d.slug}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {(d as HospitalDoctor & { department?: Department })
                            .department?.name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {formatCurrency(Number(d.consultation_fee) || 0)}
                        </td>
                        <td className="px-4 py-3 text-xs uppercase">
                          {(d.available_days || []).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              d.status === "active" ? "success" : "warning"
                            }
                          >
                            {d.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {d.slug ? (
                              <Link
                                href={`/doctors/${d.slug}`}
                                target="_blank"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
                                aria-label="View public profile"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(d)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void remove(d.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
