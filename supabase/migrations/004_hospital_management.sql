-- =============================================================================
-- Step 6 — Hospital Management System
-- Departments, Doctors, Patients, Availability, Notifications
-- Run in Supabase SQL Editor after 001–003
-- Does NOT drop existing appointments / public booking tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Departments
-- -----------------------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null default '',
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departments_status_idx on public.departments (status);

drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Hospital doctors (admin-managed roster)
-- -----------------------------------------------------------------------------
create table if not exists public.hospital_doctors (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete set null,
  name text not null,
  title text not null default 'Consultant',
  photo_url text,
  qualifications text[] not null default '{}',
  specializations text[] not null default '{}',
  experience_years integer not null default 0,
  experience_notes text not null default '',
  consultation_fee numeric(12,2) not null default 500,
  available_days text[] not null default array['mon','tue','wed','thu','fri','sat'],
  time_slots text[] not null default array[
    '09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM',
    '12:00 PM','02:00 PM','03:00 PM','05:00 PM','06:00 PM'
  ],
  biography text not null default '',
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hospital_doctors_department_idx
  on public.hospital_doctors (department_id);
create index if not exists hospital_doctors_status_idx
  on public.hospital_doctors (status);
create index if not exists hospital_doctors_name_idx
  on public.hospital_doctors (name);

drop trigger if exists hospital_doctors_set_updated_at on public.hospital_doctors;
create trigger hospital_doctors_set_updated_at
  before update on public.hospital_doctors
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Patients registry (admin CRM; appointments still work by phone)
-- -----------------------------------------------------------------------------
create table if not exists public.hospital_patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  age integer check (age is null or (age >= 0 and age <= 120)),
  gender text check (gender is null or gender in ('male', 'female', 'other')),
  address text not null default '',
  medical_history text not null default '',
  blood_group text,
  emergency_contact text,
  notes text not null default '',
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospital_patients_phone_unique unique (phone)
);

create index if not exists hospital_patients_name_idx
  on public.hospital_patients (full_name);
create index if not exists hospital_patients_phone_idx
  on public.hospital_patients (phone);
create index if not exists hospital_patients_email_idx
  on public.hospital_patients (email);

drop trigger if exists hospital_patients_set_updated_at on public.hospital_patients;
create trigger hospital_patients_set_updated_at
  before update on public.hospital_patients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Doctor day availability (leave / holiday / emergency)
-- -----------------------------------------------------------------------------
create table if not exists public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.hospital_doctors (id) on delete cascade,
  date date not null,
  status text not null default 'available'
    check (status in ('available', 'on_leave', 'holiday', 'emergency')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_availability_unique unique (doctor_id, date)
);

create index if not exists doctor_availability_date_idx
  on public.doctor_availability (date);
create index if not exists doctor_availability_doctor_idx
  on public.doctor_availability (doctor_id);

drop trigger if exists doctor_availability_set_updated_at on public.doctor_availability;
create trigger doctor_availability_set_updated_at
  before update on public.doctor_availability
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Admin notifications
-- -----------------------------------------------------------------------------
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'info'
    check (type in (
      'appointment_confirmed',
      'appointment_cancelled',
      'appointment_reminder',
      'appointment_created',
      'admin',
      'info'
    )),
  title text not null,
  message text not null default '',
  meta jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_read_idx
  on public.admin_notifications (is_read, created_at desc);

-- -----------------------------------------------------------------------------
-- Optional revenue helper column (nullable — does not break public booking)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'consultation_fee'
  ) then
    alter table public.appointments
      add column consultation_fee numeric(12,2);
  end if;
end $$;

create index if not exists appointments_doctor_date_idx
  on public.appointments (doctor_id, date);

-- -----------------------------------------------------------------------------
-- Seed default departments (idempotent)
-- -----------------------------------------------------------------------------
insert into public.departments (name, slug, description, status)
values
  ('Pulmonology', 'pulmonology', 'Lung and respiratory care', 'active'),
  ('Cardiology', 'cardiology', 'Heart and vascular care', 'active'),
  ('Neurology', 'neurology', 'Brain and nerve care', 'active'),
  ('Orthopedics', 'orthopedics', 'Bones and joints', 'active'),
  ('Pediatrics', 'pediatrics', 'Child health', 'active')
on conflict (slug) do nothing;

-- Seed primary doctor if empty
insert into public.hospital_doctors (
  department_id, name, title, qualifications, specializations,
  experience_years, experience_notes, consultation_fee, biography, status
)
select
  d.id,
  'Dr. Varaprasad Venkata Sumanth',
  'Consultant Pulmonologist & Critical Care Specialist',
  array['MBBS','DNB','FSM','CCEBDM'],
  array['Pulmonology','Asthma','COPD','Respiratory Medicine','Critical Care'],
  15,
  'Ex Consultant Pulmonologist; Ex Assistant Professor',
  500,
  'Specialist in advanced respiratory medicine serving Badvel and surrounding regions.',
  'active'
from public.departments d
where d.slug = 'pulmonology'
  and not exists (select 1 from public.hospital_doctors limit 1);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.hospital_doctors enable row level security;
alter table public.hospital_patients enable row level security;
alter table public.doctor_availability enable row level security;
alter table public.admin_notifications enable row level security;

-- Public can read active departments & active doctors (for future public pages)
drop policy if exists "Departments public read active" on public.departments;
create policy "Departments public read active"
  on public.departments for select
  to anon, authenticated
  using (status = 'active' or public.is_admin());

drop policy if exists "Departments admin write" on public.departments;
create policy "Departments admin write"
  on public.departments for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Doctors public read active" on public.hospital_doctors;
create policy "Doctors public read active"
  on public.hospital_doctors for select
  to anon, authenticated
  using (status = 'active' or public.is_admin());

drop policy if exists "Doctors admin write" on public.hospital_doctors;
create policy "Doctors admin write"
  on public.hospital_doctors for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Patients admin only" on public.hospital_patients;
create policy "Patients admin only"
  on public.hospital_patients for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Availability public read" on public.doctor_availability;
create policy "Availability public read"
  on public.doctor_availability for select
  to anon, authenticated
  using (true);

drop policy if exists "Availability admin write" on public.doctor_availability;
create policy "Availability admin write"
  on public.doctor_availability for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Notifications admin only" on public.admin_notifications;
create policy "Notifications admin only"
  on public.admin_notifications for all
  using (public.is_admin())
  with check (public.is_admin());

-- Storage bucket for doctor photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doctor-photos',
  'doctor-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read doctor-photos" on storage.objects;
create policy "Public read doctor-photos"
  on storage.objects for select
  to public
  using (bucket_id = 'doctor-photos');

drop policy if exists "Admin upload doctor-photos" on storage.objects;
create policy "Admin upload doctor-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'doctor-photos' and public.is_admin());

drop policy if exists "Admin update doctor-photos" on storage.objects;
create policy "Admin update doctor-photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'doctor-photos' and public.is_admin());

drop policy if exists "Admin delete doctor-photos" on storage.objects;
create policy "Admin delete doctor-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'doctor-photos' and public.is_admin());
