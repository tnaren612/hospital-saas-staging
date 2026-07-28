/**
 * Database types aligned with supabase/migrations/001_initial_schema.sql
 * Keep in sync when you change the SQL schema.
 */

export type UserRole = "patient" | "admin" | "staff";

export type DbAppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "upcoming";

export type DbAppointmentType = "in-person" | "video";

export type DbGender = "male" | "female" | "other";

export type DbTimePeriod = "morning" | "afternoon" | "evening";

export interface DbProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface DbAppointment {
  id: string;
  patient_id: string | null;
  patient_name: string;
  phone: string;
  email: string;
  age: number;
  gender: DbGender;
  problem: string;
  doctor_id: string;
  doctor_name: string;
  department_id?: string | null;
  department_name?: string | null;
  booking_ref?: string | null;
  date: string;
  time_slot: string;
  period: DbTimePeriod;
  type: DbAppointmentType;
  status: DbAppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** @deprecated Prefer DbBlogArticle / blog_articles table */
export interface DbArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  cover_image: string | null;
  tags: string[];
  published_at: string | null;
  read_time: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBlogArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  cover_image: string;
  tags: string[];
  author: string;
  published_at: string;
  read_time: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbGalleryImage {
  id: string;
  storage_path: string;
  public_url: string;
  alt: string;
  category: string;
  sort_order: number;
  created_at: string;
}

export interface DbContactMessage {
  id: string;
  name: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: DbProfile;
        Insert: Partial<DbProfile> & { id: string };
        Update: Partial<DbProfile>;
      };
      appointments: {
        Row: DbAppointment;
        Insert: Omit<
          DbAppointment,
          "id" | "created_at" | "updated_at" | "notes"
        > & {
          id?: string;
          notes?: string | null;
          patient_id?: string | null;
        };
        Update: Partial<DbAppointment>;
      };
      articles: {
        Row: DbArticle;
        Insert: Partial<DbArticle> & {
          slug: string;
          title: string;
          content: string;
        };
        Update: Partial<DbArticle>;
      };
      blog_articles: {
        Row: DbBlogArticle;
        Insert: Partial<DbBlogArticle> & {
          slug: string;
          title: string;
          content: string;
        };
        Update: Partial<DbBlogArticle>;
      };
      gallery_images: {
        Row: DbGalleryImage;
        Insert: Omit<DbGalleryImage, "id" | "created_at"> & { id?: string };
        Update: Partial<DbGalleryImage>;
      };
      contact_messages: {
        Row: DbContactMessage;
        Insert: Omit<DbContactMessage, "id" | "created_at" | "is_read"> & {
          id?: string;
          is_read?: boolean;
        };
        Update: Partial<DbContactMessage>;
      };
    };
  };
}
