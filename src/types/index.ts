export type Locale = "en" | "te";

export type Gender = "male" | "female" | "other";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "upcoming"
  | "no_show"
  | "checked_in";

export type TimePeriod = "morning" | "afternoon" | "evening";

export type ArticleCategory =
  | "lungs"
  | "asthma"
  | "covid"
  | "general"
  | "copd"
  | "critical-care";

export interface HospitalInfo {
  name: string;
  tagline: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  phones: string[];
  emergencyPhone: string;
  whatsapp: string;
  email: string;
  timings: {
    opd: string;
    emergency: string;
  };
  geo: {
    lat: number;
    lng: number;
  };
  social: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
}

export interface DoctorProfile {
  id: string;
  name: string;
  title: string;
  image: string;
  /** Wide banner used on Home Lead Specialist + Doctor page hero */
  banner?: string;
  qualifications: string[];
  specializations: string[];
  experience: string[];
  awards: string[];
  certificates: string[];
  bio: string;
  gallery: string[];
  consultationFee: number;
  videoConsultationFee: number;
  languages: string[];
}

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
  image: string;
  features: string[];
}

export interface Facility {
  id: string;
  title: string;
  description: string;
  icon: string;
  image: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  content: string;
  rating: number;
  image: string;
  date: string;
  /** Treatment / department the patient received care for */
  treatment?: string;
  /** Optional featured flag for homepage carousel */
  featured?: boolean;
  /** Soft-delete / visibility for admin CMS */
  published?: boolean;
}

export interface InsurancePartner {
  id: string;
  name: string;
  logo: string;
  description: string;
}

export interface HealthPackage {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  description: string;
  includes: string[];
  popular?: boolean;
  image: string;
}

export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: ArticleCategory;
  author: string;
  coverImage: string;
  publishedAt: string;
  readTime: number;
  tags: string[];
}

export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  category: string;
  order: number;
}

export interface TimeSlot {
  id: string;
  time: string;
  period: TimePeriod;
  available: boolean;
}

export interface Appointment {
  id: string;
  patientName: string;
  phone: string;
  email: string;
  age: number;
  gender: Gender;
  problem: string;
  doctorId: string;
  doctorName: string;
  departmentId?: string;
  departmentName?: string;
  date: string;
  timeSlot: string;
  period: TimePeriod;
  type: "in-person" | "video";
  status: AppointmentStatus;
  createdAt: string;
  notes?: string;
  bookingRef?: string;
  /** Daily reception queue token */
  queueToken?: number | null;
  checkedInAt?: string | null;
  cancelReason?: string | null;
  /** Billing — from appointments.payment_status */
  paymentStatus?: string;
  invoiceId?: string;
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  age?: number;
  gender?: Gender;
}

export interface PatientReport {
  id: string;
  title: string;
  date: string;
  type: string;
  status: string;
}

export interface Invoice {
  id: string;
  title: string;
  amount: number;
  date: string;
  status: "paid" | "pending" | "overdue";
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface AnalyticsPoint {
  label: string;
  visitors: number;
  appointments: number;
  revenue: number;
}

export interface CounterStat {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  icon: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
