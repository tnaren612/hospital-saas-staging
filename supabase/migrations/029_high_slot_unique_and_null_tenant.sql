-- =============================================================================
-- HIGH H-07 / H-09 — tighten null hospital visibility + unique appointment slots
-- Apply manually after 027/028. Does not delete production data.
-- =============================================================================

-- H-07: same_hospital no longer treats NULL hospital_id as visible to all
create or replace function public.same_hospital(row_hospital_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_hospital_id() is not null
    and row_hospital_id is not null
    and row_hospital_id = public.current_hospital_id();
$$;

comment on function public.same_hospital(uuid) is
  'Tenant isolation: exact hospital match. Null hospital_id rows are not visible (H-07).';

-- Final backfill of any remaining nulls before optional NOT NULL
do $$
declare
  t text;
  tables text[] := array[
    'appointments',
    'hospital_doctors',
    'hospital_patients',
    'departments',
    'doctor_availability',
    'lab_orders',
    'medicines',
    'prescriptions',
    'hospital_bills',
    'finance_expenses',
    'hr_employees',
    'hr_leave_requests',
    'hr_attendance',
    'invoices',
    'payments',
    'payment_settings'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'hospital_id'
    ) then
      execute format(
        'update public.%I set hospital_id = public.default_hospital_id() where hospital_id is null and public.default_hospital_id() is not null',
        t
      );
    end if;
  end loop;
end $$;

-- H-09: prevent double-book race (active appointments only)
-- Uses doctor_id + date + time_slot (+ hospital_id when present)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'appointments'
  ) then
    -- Composite index for queue/list
    execute 'create index if not exists appointments_hospital_date_doctor_idx
      on public.appointments (hospital_id, date, doctor_id)';

    -- Unique active slot per hospital/doctor/date/time
    -- Drop prior attempt if re-running
    execute 'drop index if exists appointments_unique_active_slot_idx';

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'hospital_id'
    ) then
      execute $idx$
        create unique index appointments_unique_active_slot_idx
        on public.appointments (hospital_id, doctor_id, date, time_slot)
        where status is distinct from 'cancelled'
          and status is distinct from 'no_show'
          and hospital_id is not null
      $idx$;
    else
      execute $idx$
        create unique index appointments_unique_active_slot_idx
        on public.appointments (doctor_id, date, time_slot)
        where status is distinct from 'cancelled'
          and status is distinct from 'no_show'
      $idx$;
    end if;
  end if;
exception
  when unique_violation then
    raise notice 'Could not create unique slot index — resolve duplicate appointments first';
  when others then
    raise notice 'appointments unique index skipped: %', SQLERRM;
end $$;
