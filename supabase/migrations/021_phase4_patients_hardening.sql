-- =============================================================================
-- Phase 4 — Patient registry hardening
-- Soft delete, structured emergency contact, optional portal link
-- =============================================================================

alter table public.hospital_patients
  add column if not exists deleted_at timestamptz;

alter table public.hospital_patients
  add column if not exists emergency_contact_name text;

alter table public.hospital_patients
  add column if not exists emergency_contact_phone text;

alter table public.hospital_patients
  add column if not exists allergies text not null default '';

alter table public.hospital_patients
  add column if not exists portal_user_id uuid references auth.users (id) on delete set null;

create index if not exists hospital_patients_deleted_at_idx
  on public.hospital_patients (deleted_at)
  where deleted_at is null;

create index if not exists hospital_patients_status_active_idx
  on public.hospital_patients (status)
  where deleted_at is null;

create index if not exists hospital_patients_portal_user_idx
  on public.hospital_patients (portal_user_id)
  where portal_user_id is not null;

comment on column public.hospital_patients.deleted_at is
  'Soft delete; null = active record';
comment on column public.hospital_patients.allergies is
  'Known allergies (PHI — staff access only)';
