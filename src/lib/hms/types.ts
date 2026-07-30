export type EntityStatus = "active" | "inactive";

export type AvailabilityStatus =
  | "available"
  | "on_leave"
  | "holiday"
  | "emergency";

export type WeekDay =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type Department = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: EntityStatus;
  created_at?: string;
  updated_at?: string;
};

export type DoctorFaq = {
  question: string;
  answer: string;
};

export type HospitalDoctor = {
  id: string;
  slug?: string | null;
  department_id: string | null;
  name: string;
  title: string;
  photo_url: string | null;
  qualifications: string[];
  degrees?: string[];
  certifications?: string[];
  specializations: string[];
  experience_years: number;
  experience_notes: string;
  experience_timeline?: string[];
  awards?: string[];
  memberships?: string[];
  languages?: string[];
  treatments?: string[];
  services?: string[];
  faqs?: DoctorFaq[];
  consultation_fee: number;
  video_consultation_fee?: number | null;
  /** in_person | video */
  consultation_types?: string[];
  available_days: string[];
  time_slots: string[];
  consultation_timings?: string;
  biography: string;
  video_intro_url?: string | null;
  is_featured?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  status: EntityStatus;
  sort_order: number;
  profile_user_id?: string | null;
  deleted_at?: string | null;
  department?: Department | null;
  created_at?: string;
  updated_at?: string;
};

export type HospitalPatient = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  age: number | null;
  gender: "male" | "female" | "other" | null;
  address: string;
  medical_history: string;
  allergies?: string;
  blood_group: string | null;
  emergency_contact: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes: string;
  status: EntityStatus;
  portal_user_id?: string | null;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DoctorAvailability = {
  id: string;
  doctor_id: string;
  date: string;
  status: AvailabilityStatus;
  note: string;
  doctor?: HospitalDoctor | null;
  created_at?: string;
};

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  meta: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

export const WEEK_DAYS: { value: WeekDay; label: string }[] = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

export const AVAILABILITY_OPTIONS: {
  value: AvailabilityStatus;
  label: string;
}[] = [
  { value: "available", label: "Available" },
  { value: "on_leave", label: "On Leave" },
  { value: "holiday", label: "Holiday" },
  { value: "emergency", label: "Emergency" },
];
