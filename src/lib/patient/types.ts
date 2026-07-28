import type { Appointment, AppointmentStatus, Gender } from "@/types";

export type PortalPatient = {
  id: string;
  user_id: string;
  mrn: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  gender: Gender | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  blood_group: string | null;
  address: string;
  emergency_contact: string | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  profile_photo: string;
};

export type PatientDocument = {
  id: string;
  patient_id: string;
  type: string;
  title: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  uploaded_at: string;
};

export type PatientReport = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string | null;
  title: string;
  report_url: string;
  report_type: string;
  uploaded_at: string;
};

export type PatientNotification = {
  id: string;
  patient_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown>;
};

export type PatientDashboardData = {
  mode: "supabase" | "demo" | "unauthenticated";
  patient: PortalPatient | null;
  counts: {
    upcoming: number;
    completed: number;
    cancelled: number;
    reports: number;
    packages: number;
    unreadNotifications: number;
  };
  upcoming: Appointment[];
  recentAppointments: Appointment[];
  reports: PatientReport[];
  notifications: PatientNotification[];
  assignedDoctor: {
    id: string;
    name: string;
    title?: string;
    photo_url?: string | null;
    slug?: string | null;
  } | null;
  packages: { slug: string; name: string; date: string }[];
};

export type PatientSessionMode = "supabase" | "demo" | "none";

export const DOC_TYPES = [
  { value: "insurance_card", label: "Insurance Card" },
  { value: "government_id", label: "Government ID" },
  { value: "previous_report", label: "Previous Report" },
  { value: "referral", label: "Referral Letter" },
  { value: "prescription", label: "Prescription" },
  { value: "other", label: "Other" },
] as const;

export function isActiveStatus(status: AppointmentStatus): boolean {
  return (
    status === "confirmed" || status === "upcoming" || status === "pending"
  );
}
