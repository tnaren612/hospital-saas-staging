-- =============================================================================
-- Phase 5 — Appointments: queue tokens, check-in, no_show, cancel reason
-- =============================================================================

-- Expand status constraint to include no_show + checked_in
do $$
begin
  alter table public.appointments drop constraint if exists appointments_status_check;
exception when undefined_object then null;
end $$;

-- Also drop unnamed check if PostgreSQL named it differently
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.appointments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.appointments drop constraint %I', cname);
  end if;
exception when others then null;
end $$;

alter table public.appointments
  add column if not exists queue_token integer;

alter table public.appointments
  add column if not exists checked_in_at timestamptz;

alter table public.appointments
  add column if not exists cancel_reason text;

alter table public.appointments
  add column if not exists cancelled_at timestamptz;

-- Re-add status check with no_show + checked_in
do $$
begin
  alter table public.appointments
    add constraint appointments_status_check
    check (
      status in (
        'pending',
        'confirmed',
        'completed',
        'cancelled',
        'upcoming',
        'no_show',
        'checked_in'
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists appointments_date_status_idx
  on public.appointments (date, status);

create index if not exists appointments_queue_day_idx
  on public.appointments (date, queue_token)
  where queue_token is not null;

create index if not exists appointments_doctor_date_idx
  on public.appointments (doctor_id, date);

comment on column public.appointments.queue_token is
  'Daily reception token number (per hospital calendar day)';
comment on column public.appointments.checked_in_at is
  'When patient arrived / checked in at reception';
