import { z } from "zod";

export const appointmentSchema = z.object({
  patientName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name is too long")
    .regex(/^[a-zA-Z\s.]+$/, "Name contains invalid characters"),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email("Enter a valid email address"),
  age: z.coerce
    .number()
    .min(1, "Age must be at least 1")
    .max(120, "Enter a valid age"),
  gender: z.enum(["male", "female", "other"], {
    required_error: "Select gender",
  }),
  problem: z
    .string()
    .min(5, "Please describe your problem briefly")
    .max(500, "Description is too long"),
  departmentId: z.string().optional(),
  doctorId: z.string().min(1, "Select a doctor"),
  date: z.string().min(1, "Select a date"),
  timeSlot: z.string().min(1, "Select a time slot"),
  type: z.enum(["in-person", "video"]),
});

export type AppointmentFormValues = z.infer<typeof appointmentSchema>;

export const contactSchema = z.object({
  name: z.string().min(2, "Name is required").max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile required"),
  email: z.string().email("Valid email required"),
  subject: z.string().min(3, "Subject is required").max(120),
  message: z.string().min(10, "Message is too short").max(1000),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

export const loginSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile required"),
  otp: z.string().length(6, "OTP must be 6 digits").optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const articleSchema = z.object({
  title: z.string().min(5).max(160),
  excerpt: z.string().min(10).max(300),
  content: z.string().min(20),
  category: z.enum(["lungs", "asthma", "covid", "general", "copd", "critical-care"]),
  /** Public URL from Gallery CMS, or local placeholder / blob preview before upload */
  coverImage: z.string().min(1, "Cover image is required (upload or keep existing)"),
  tags: z.string().optional(),
});

export type ArticleFormValues = z.infer<typeof articleSchema>;

export const doctorUpdateSchema = z.object({
  name: z.string().min(3).max(100),
  title: z.string().min(3).max(120),
  bio: z.string().min(20).max(2000),
  consultationFee: z.coerce.number().min(0),
  videoConsultationFee: z.coerce.number().min(0),
  qualifications: z.string().min(2),
  specializations: z.string().min(2),
  experience: z.string().min(2),
  image: z.string().min(1),
});

export type DoctorUpdateFormValues = z.infer<typeof doctorUpdateSchema>;

/** Login only validates presence; strength enforced on set/change password. */
export const adminLoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});

export type AdminLoginFormValues = z.infer<typeof adminLoginSchema>;

/** Patient testimonial (admin CMS / public form) */
export const testimonialSchema = z.object({
  name: z
    .string()
    .min(2, "Name is required")
    .max(80)
    .regex(/^[a-zA-Z\s.]+$/, "Name contains invalid characters"),
  role: z.string().min(2).max(80),
  treatment: z.string().min(2).max(100).optional(),
  content: z.string().min(10, "Review is too short").max(800),
  rating: z.coerce.number().min(1).max(5),
  image: z.string().min(1).max(500),
  date: z.string().min(8).max(32).optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
});

export type TestimonialFormValues = z.infer<typeof testimonialSchema>;

/** Sanitize free text for safe HTML embedding (defense-in-depth) */
export function sanitizePlainText(input: string, maxLen = 2000): string {
  return String(input || "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLen);
}
