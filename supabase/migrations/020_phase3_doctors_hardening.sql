-- =============================================================================
-- Phase 3 — Doctor management hardening
-- Soft delete, consultation types, optional auth link, indexes
-- Idempotent / rollback-safe (add column if not exists)
-- =============================================================================

-- Soft delete (prefer deactivate + deleted_at over hard DELETE)
alter table public.hospital_doctors
  add column if not exists deleted_at timestamptz;

alter table public.hospital_doctors
  add column if not exists consultation_types text[] not null default array['in_person', 'video'];

-- Optional link to auth.users for doctor portal identity
alter table public.hospital_doctors
  add column if not exists profile_user_id uuid references auth.users (id) on delete set null;

create index if not exists hospital_doctors_deleted_at_idx
  on public.hospital_doctors (deleted_at)
  where deleted_at is null;

create index if not exists hospital_doctors_profile_user_idx
  on public.hospital_doctors (profile_user_id)
  where profile_user_id is not null;

create index if not exists hospital_doctors_consultation_types_gin
  on public.hospital_doctors using gin (consultation_types);

-- Ensure active public listings ignore soft-deleted rows (view optional)
create or replace view public.v_active_hospital_doctors as
select *
from public.hospital_doctors
where deleted_at is null
  and status = 'active';

comment on column public.hospital_doctors.deleted_at is
  'Soft delete timestamp; null = not deleted';
comment on column public.hospital_doctors.consultation_types is
  'Supported consultation modes: in_person, video';
comment on column public.hospital_doctors.profile_user_id is
  'Optional auth.users id for doctor login linkage';
