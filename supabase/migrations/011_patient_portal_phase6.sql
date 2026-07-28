-- =============================================================================
-- Phase 6 — Patient Portal
-- Reuses appointments + profiles. New tables for portal profile, docs, reports.
-- Idempotent.
-- =============================================================================

-- Portal patient profile (1:1 with auth.users / profiles)
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  mrn text unique,
  first_name text not null default '',
  last_name text not null default '',
  gender text check (gender is null or gender in ('male', 'female', 'other')),
  date_of_birth date,
  phone text,
  email text,
  blood_group text,
  address text not null default '',
  emergency_contact text,
  insurance_provider text,
  insurance_number text,
  profile_photo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patients_user_id_idx on public.patients (user_id);
create index if not exists patients_phone_idx on public.patients (phone);
create index if not exists patients_email_idx on public.patients (email);

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- Auto MRN if missing
create or replace function public.patients_set_mrn()
returns trigger
language plpgsql
as $$
begin
  if new.mrn is null or new.mrn = '' then
    new.mrn := 'MRN-' || upper(substr(replace(new.id::text, '-', ''), 1, 10));
  end if;
  return new;
end;
$$;

drop trigger if exists patients_set_mrn on public.patients;
create trigger patients_set_mrn
  before insert on public.patients
  for each row execute function public.patients_set_mrn();

-- Documents
create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  type text not null default 'other'
    check (type in (
      'insurance_card', 'government_id', 'previous_report',
      'referral', 'prescription', 'other'
    )),
  title text not null,
  file_url text not null,
  file_name text not null default '',
  mime_type text not null default '',
  uploaded_at timestamptz not null default now()
);

create index if not exists patient_documents_patient_idx
  on public.patient_documents (patient_id, uploaded_at desc);

-- Clinical reports (admin/doctor uploaded for patient)
create table if not exists public.patient_reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  doctor_id text,
  title text not null,
  report_url text not null,
  report_type text not null default 'general',
  uploaded_at timestamptz not null default now()
);

create index if not exists patient_reports_patient_idx
  on public.patient_reports (patient_id, uploaded_at desc);

-- Patient notifications
create table if not exists public.patient_notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  title text not null,
  message text not null default '',
  type text not null default 'info'
    check (type in (
      'appointment_confirmed',
      'appointment_cancelled',
      'appointment_reminder',
      'report_uploaded',
      'package_reminder',
      'info'
    )),
  is_read boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists patient_notifications_patient_idx
  on public.patient_notifications (patient_id, is_read, created_at desc);

-- Optional package linkage on appointments (payment-ready later)
alter table public.appointments
  add column if not exists package_slug text;

alter table public.appointments
  add column if not exists package_name text;

-- Helper: current portal patient id
create or replace function public.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.patients p
  where p.user_id = auth.uid()
  limit 1;
$$;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.patients enable row level security;
alter table public.patient_documents enable row level security;
alter table public.patient_reports enable row level security;
alter table public.patient_notifications enable row level security;

-- Patients: own row only (+ admin)
drop policy if exists "Patients: own select" on public.patients;
create policy "Patients: own select"
  on public.patients for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Patients: own insert" on public.patients;
create policy "Patients: own insert"
  on public.patients for insert
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Patients: own update" on public.patients;
create policy "Patients: own update"
  on public.patients for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Documents
drop policy if exists "Patient docs: own" on public.patient_documents;
create policy "Patient docs: own"
  on public.patient_documents for all
  using (
    patient_id = public.current_patient_id() or public.is_admin()
  )
  with check (
    patient_id = public.current_patient_id() or public.is_admin()
  );

-- Reports: patients read own; admin write
drop policy if exists "Patient reports: own select" on public.patient_reports;
create policy "Patient reports: own select"
  on public.patient_reports for select
  using (
    patient_id = public.current_patient_id() or public.is_admin()
  );

drop policy if exists "Patient reports: admin write" on public.patient_reports;
create policy "Patient reports: admin write"
  on public.patient_reports for all
  using (public.is_admin())
  with check (public.is_admin());

-- Notifications
drop policy if exists "Patient notifs: own select" on public.patient_notifications;
create policy "Patient notifs: own select"
  on public.patient_notifications for select
  using (
    patient_id = public.current_patient_id() or public.is_admin()
  );

drop policy if exists "Patient notifs: own update" on public.patient_notifications;
create policy "Patient notifs: own update"
  on public.patient_notifications for update
  using (
    patient_id = public.current_patient_id() or public.is_admin()
  );

drop policy if exists "Patient notifs: own delete" on public.patient_notifications;
create policy "Patient notifs: own delete"
  on public.patient_notifications for delete
  using (
    patient_id = public.current_patient_id() or public.is_admin()
  );

drop policy if exists "Patient notifs: admin insert" on public.patient_notifications;
create policy "Patient notifs: admin insert"
  on public.patient_notifications for insert
  with check (public.is_admin() or patient_id = public.current_patient_id());

-- Appointments: allow patients to update own by phone match / patient_id
-- Keep existing public insert + admin policies; add patient self-service update
drop policy if exists "Appointments: patient update own" on public.appointments;
create policy "Appointments: patient update own"
  on public.appointments for update
  to authenticated
  using (
    public.is_admin()
    or patient_id = auth.uid()
    or phone in (
      select phone from public.patients where user_id = auth.uid() and phone is not null
    )
    or phone in (
      select phone from public.profiles where id = auth.uid() and phone is not null
    )
  )
  with check (
    public.is_admin()
    or patient_id = auth.uid()
    or phone in (
      select phone from public.patients where user_id = auth.uid() and phone is not null
    )
    or phone in (
      select phone from public.profiles where id = auth.uid() and phone is not null
    )
  );

-- Storage bucket for patient files (documents / reports)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-files',
  'patient-files',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- Storage policies: authenticated users can manage files under their user id folder
drop policy if exists "Patient files: own read" on storage.objects;
create policy "Patient files: own read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'patient-files'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "Patient files: own insert" on storage.objects;
create policy "Patient files: own insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'patient-files'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "Patient files: own delete" on storage.objects;
create policy "Patient files: own delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'patient-files'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

comment on table public.patients is
  'Patient portal profiles (auth.users). Separate from hospital_patients CRM.';
