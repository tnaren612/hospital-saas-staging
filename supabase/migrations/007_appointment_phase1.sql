-- =============================================================================
-- Phase 1 — Appointment Management hardening
-- Run after 001–006. Safe / idempotent.
-- =============================================================================

-- Optional department linkage on bookings (public form can set these)
alter table public.appointments
  add column if not exists department_id uuid references public.departments (id) on delete set null;

alter table public.appointments
  add column if not exists department_name text;

alter table public.appointments
  add column if not exists booking_ref text;

-- Human-readable booking reference helper (filled by app if empty)
create index if not exists appointments_booking_ref_idx
  on public.appointments (booking_ref)
  where booking_ref is not null;

create index if not exists appointments_department_idx
  on public.appointments (department_id);

-- Allow re-booking a slot after cancellation:
-- Drop legacy full unique constraint if present, replace with partial unique index.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'appointments_unique_slot'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments drop constraint appointments_unique_slot;
  end if;
end $$;

-- Only non-cancelled appointments occupy a slot
drop index if exists appointments_unique_active_slot_idx;
create unique index appointments_unique_active_slot_idx
  on public.appointments (doctor_id, date, time_slot)
  where status is distinct from 'cancelled';

-- Ensure Emergency / Critical Care / General Medicine / Diagnostics / Pharmacy exist
insert into public.departments (name, slug, description, status)
values
  ('Pulmonology', 'pulmonology', 'Lung and respiratory care', 'active'),
  ('Critical Care', 'critical-care', 'ICU and critical care services', 'active'),
  ('General Medicine', 'general-medicine', 'General medical consultation', 'active'),
  ('Emergency', 'emergency', '24×7 emergency care', 'active'),
  ('Diagnostics', 'diagnostics', 'Lab and diagnostic services', 'active'),
  ('Pharmacy', 'pharmacy', 'In-house pharmacy', 'active')
on conflict (slug) do nothing;

-- Seed primary pulmonologist if roster empty (links to first Pulmonology dept)
insert into public.hospital_doctors (
  department_id,
  name,
  title,
  qualifications,
  specializations,
  experience_years,
  experience_notes,
  consultation_fee,
  available_days,
  time_slots,
  biography,
  status,
  sort_order
)
select
  d.id,
  'Dr. Varaprasad Venkata Sumanth',
  'Consultant Pulmonologist & Critical Care',
  array['MBBS', 'MD (Pulmonary Medicine)'],
  array['Pulmonology', 'Critical Care', 'Sleep Medicine'],
  15,
  'Specialist in asthma, COPD, ICU and respiratory emergencies.',
  500,
  array['mon','tue','wed','thu','fri','sat'],
  array[
    '09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM',
    '12:00 PM','12:30 PM',
    '02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM',
    '05:00 PM','05:30 PM','06:00 PM','06:30 PM'
  ],
  'Senior consultant providing comprehensive respiratory care at Sri Srinivasa Hospital, Badvel.',
  'active',
  0
from public.departments d
where d.slug = 'pulmonology'
  and not exists (
    select 1 from public.hospital_doctors hd
    where lower(hd.name) like '%varaprasad%'
  )
limit 1;

comment on column public.appointments.department_id is
  'Optional link to departments for filtered booking UX';
comment on index public.appointments_unique_active_slot_idx is
  'Prevents double-booking; cancelled rows free the slot';
