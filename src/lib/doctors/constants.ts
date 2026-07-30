/**
 * Canonical catalogs for doctor management (UI + validation).
 */

export const CONSULTATION_TYPES = [
  { value: "in_person", label: "In-person" },
  { value: "video", label: "Video consult" },
] as const;

export type ConsultationTypeValue =
  (typeof CONSULTATION_TYPES)[number]["value"];

/** Suggested specializations for hospital (free text still allowed) */
export const SPECIALIZATION_CATALOG = [
  "Pulmonology",
  "Critical Care",
  "General Medicine",
  "Cardiology",
  "Pediatrics",
  "Orthopedics",
  "Gynecology",
  "ENT",
  "Dermatology",
  "Neurology",
  "Nephrology",
  "Gastroenterology",
  "Emergency Medicine",
  "Anesthesiology",
  "Radiology",
  "Pathology",
] as const;

export const DOCTOR_STATUSES = ["active", "inactive"] as const;

/** Roles allowed to create/update/delete doctors */
export const DOCTOR_WRITE_ROLES = [
  "super_admin",
  "admin",
  "hr",
  "manager",
] as const;

/** Roles allowed to manage availability calendars */
export const AVAILABILITY_WRITE_ROLES = [
  "super_admin",
  "admin",
  "hr",
  "manager",
  "receptionist",
] as const;
