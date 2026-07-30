/**
 * Shared Zod schemas for hospital doctor CRUD.
 */

import { z } from "zod";
import { CONSULTATION_TYPES, DOCTOR_STATUSES } from "@/lib/doctors/constants";

const consultationTypeValues = CONSULTATION_TYPES.map((c) => c.value) as [
  string,
  ...string[],
];

export const doctorFaqSchema = z.object({
  question: z.string().min(3).max(300),
  answer: z.string().min(3).max(2000),
});

export const doctorCreateSchema = z.object({
  name: z.string().min(2).max(120),
  title: z.string().max(160).optional(),
  slug: z.string().max(120).optional().nullable(),
  department_id: z.string().uuid().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  qualifications: z.array(z.string().max(120)).max(40).optional(),
  degrees: z.array(z.string().max(120)).max(40).optional(),
  certifications: z.array(z.string().max(160)).max(40).optional(),
  specializations: z.array(z.string().max(120)).max(40).optional(),
  experience_years: z.coerce.number().min(0).max(80).optional(),
  experience_notes: z.string().max(2000).optional(),
  experience_timeline: z.array(z.string().max(300)).max(40).optional(),
  awards: z.array(z.string().max(200)).max(40).optional(),
  memberships: z.array(z.string().max(200)).max(40).optional(),
  languages: z.array(z.string().max(60)).max(20).optional(),
  treatments: z.array(z.string().max(200)).max(60).optional(),
  services: z.array(z.string().max(200)).max(60).optional(),
  faqs: z.array(doctorFaqSchema).max(30).optional(),
  consultation_fee: z.coerce.number().min(0).max(1_000_000).optional(),
  video_consultation_fee: z.coerce
    .number()
    .min(0)
    .max(1_000_000)
    .nullable()
    .optional(),
  consultation_types: z
    .array(z.enum(consultationTypeValues as [string, ...string[]]))
    .min(1)
    .max(4)
    .optional(),
  available_days: z.array(z.string().max(10)).max(7).optional(),
  time_slots: z.array(z.string().max(40)).max(48).optional(),
  consultation_timings: z.string().max(300).optional(),
  biography: z.string().max(8000).optional(),
  video_intro_url: z.string().max(500).nullable().optional(),
  is_featured: z.boolean().optional(),
  seo_title: z.string().max(160).nullable().optional(),
  seo_description: z.string().max(320).nullable().optional(),
  status: z.enum(DOCTOR_STATUSES).optional(),
  sort_order: z.coerce.number().optional(),
  profile_user_id: z.string().uuid().nullable().optional(),
});

export const doctorUpdateSchema = doctorCreateSchema.partial().extend({
  name: z.string().min(2).max(120).optional(),
});

export type DoctorCreateInput = z.infer<typeof doctorCreateSchema>;
export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>;

export const availabilitySchema = z.object({
  doctor_id: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  status: z.enum(["available", "on_leave", "holiday", "emergency"]),
  note: z.string().max(500).optional(),
});

export const availabilityBulkSchema = z.object({
  doctor_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["available", "on_leave", "holiday", "emergency"]),
  note: z.string().max(500).optional(),
}).refine((v) => v.from <= v.to, {
  message: "from must be on or before to",
  path: ["to"],
});

export function buildDoctorInsertPayload(
  d: DoctorCreateInput,
  slugify: (s: string) => string
) {
  const slug =
    (d.slug && slugify(d.slug)) || (d.name ? slugify(d.name) : null);

  return {
    name: d.name.trim(),
    title: d.title || "Consultant",
    slug,
    department_id: d.department_id ?? null,
    photo_url: d.photo_url ?? null,
    qualifications: d.qualifications || [],
    degrees: d.degrees || d.qualifications || [],
    certifications: d.certifications || [],
    specializations: d.specializations || [],
    experience_years: d.experience_years ?? 0,
    experience_notes: d.experience_notes || "",
    experience_timeline: d.experience_timeline || [],
    awards: d.awards || [],
    memberships: d.memberships || [],
    languages: d.languages || ["English", "Telugu"],
    treatments: d.treatments || [],
    services: d.services || [],
    faqs: d.faqs || [],
    consultation_fee: d.consultation_fee ?? 500,
    video_consultation_fee: d.video_consultation_fee ?? null,
    consultation_types: d.consultation_types || ["in_person", "video"],
    available_days: d.available_days || [
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ],
    time_slots: d.time_slots || [
      "09:00 AM",
      "10:00 AM",
      "11:00 AM",
      "05:00 PM",
      "06:00 PM",
    ],
    consultation_timings: d.consultation_timings || "",
    biography: d.biography || "",
    video_intro_url: d.video_intro_url ?? null,
    is_featured: d.is_featured ?? false,
    seo_title: d.seo_title ?? null,
    seo_description: d.seo_description ?? null,
    status: d.status || "active",
    sort_order: d.sort_order ?? 0,
    profile_user_id: d.profile_user_id ?? null,
    deleted_at: null as null,
  };
}
