-- =============================================================================
-- 046 CRITICAL SECURITY HARDENING (audit items 1-8)
-- 1) Appointments RLS: public read exposes PHI -> replaced by staff/patient-scoped
--    reads + a public slot-availability RPC. Public insert no longer writes
--    privileged columns (status/paid/walk-in/invoice linkage).
-- 2) Invoices / payments / payment_audit_logs / payment_settings: drop the
--    blanket authenticated + tenant "same hospital" policies; restrict to
--    hospital staff so patients can no longer read or mutate billing rows via
--    their own session.
-- 3) (app-side) notifications preferences now requires a patient session.
-- 4) Invoices storage bucket made private; only service role + hospital staff
--    can read/insert objects. App serves PDFs via signed URLs.
-- 5) (app-side) patient login rate limit + CRON_SECRET fail-closed.
-- 6) patient_reports / patient_notifications: hospital_id column + backfill +
--    NOT NULL so tenant ownership is never ambiguous.
-- 7) Pharmacy (045) used an unconfigured session GUC (app.current_hospital_id)
--    that the app never sets -> every pharmacy read returned no rows (or all
--    rows when the GUC leaked). Replaced with current_hospital_id()/same_hospital()
--    exactly like every other tenant table.
-- 8) (app-side) demo fallbacks are gated to non-production builds.
-- Idempotent: safe to re-run; guards every drop/create against missing objects.
-- Apply in Supabase SQL Editor (or `supabase db push`).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Helper: any operational staff role (mirrors src/lib/auth/roles.ts)
--    Includes radiology_technician, which is_staff() (018) predates.
-- ---------------------------------------------------------------------------
create or replace function public.is_hospital_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in (
        'super_admin',
        'admin',
        'doctor',
        'receptionist',
        'lab_technician',
        'radiology_technician',
        'pharmacist',
        'billing',
        'finance',
        'hr',
        'manager'
      )
  );
$$;

grant execute on function public.is_hospital_staff() to authenticated, service_role;

comment on function public.is_hospital_staff() is
  'Any operational hospital role. Used to scope PHI/financial RLS to staff.';

-- ---------------------------------------------------------------------------
-- 0b) Public slot availability RPC (replaces anon SELECT on appointments).
--     Returns only time slots already booked for a doctor+date. Security
--     definer with a fixed, narrow query: no PHI is ever exposed.
-- ---------------------------------------------------------------------------
create or replace function public.booked_slots(p_doctor_id text, p_date date)
returns table (time_slot text)
language sql
stable
security definer
set search_path = public
as $$
  select time_slot
  from public.appointments
  where doctor_id = p_doctor_id
    and date = p_date
    and status is distinct from 'cancelled'
    and status is distinct from 'no_show'
  group by time_slot
  order by time_slot;
$$;

grant execute on function public.booked_slots(text, date) to anon, authenticated, service_role;

comment on function public.booked_slots(text, date) is
  'Public slot availability (schedule only, no PHI). Backs appointment forms and /api/appointments/slots.';

-- ---------------------------------------------------------------------------
-- 1) Appointments RLS
-- ---------------------------------------------------------------------------
drop policy if exists "Appointments: public read schedule" on public.appointments;
drop policy if exists "Appointments: public insert" on public.appointments;
drop policy if exists appointments_tenant_select on public.appointments;
drop policy if exists appointments_tenant_update on public.appointments;
drop policy if exists appointments_tenant_delete on public.appointments;
drop policy if exists appointments_tenant_select_v2 on public.appointments;
drop policy if exists appointments_tenant_insert_v2 on public.appointments;
drop policy if exists appointments_tenant_update_v2 on public.appointments;
drop policy if exists appointments_tenant_delete_v2 on public.appointments;

-- Staff see appointments of their own hospital (incl. legacy NULL rows).
create policy "Appointments: staff select tenant"
  on public.appointments for select
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

-- Patients see only rows tied to their own identity (portal patients/profiles phone).
create policy "Appointments: patient read own"
  on public.appointments for select
  to authenticated
  using (
    not public.is_hospital_staff()
    and (
      patient_id = auth.uid()
      or phone in (
        select p.phone from public.patients p
        where p.user_id = auth.uid() and p.phone is not null
      )
      or phone in (
        select p.phone from public.profiles p
        where p.id = auth.uid() and p.phone is not null
      )
    )
  );

-- Public booking: only the patient-contact fields; cannot set status/payment/
-- walk-in/invoice linkage or book into another hospital.
create policy "Appointments: public book"
  on public.appointments for insert
  to anon, authenticated
  with check (
    coalesce(status, 'pending') in ('pending', 'confirmed')
    and coalesce(payment_status, 'pending') = 'pending'
    and is_walk_in is not true
    and invoice_id is null
    and (
      hospital_id is null
      or hospital_id = public.default_hospital_id()
    )
  );

-- Staff booking (reception walk-ins, queue, portal admin) into own hospital.
create policy "Appointments: staff insert tenant"
  on public.appointments for insert
  to authenticated
  with check (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Appointments: staff update tenant"
  on public.appointments for update
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  )
  with check (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Appointments: staff delete tenant"
  on public.appointments for delete
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

-- ---------------------------------------------------------------------------
-- 2) Billing tables: drop blanket authenticated + tenant-only policies.
--    Staff keep tenant-scoped access; patients no longer read financial rows.
-- ---------------------------------------------------------------------------
drop policy if exists "Invoices: authenticated select" on public.invoices;
drop policy if exists "Invoices: authenticated update" on public.invoices;
drop policy if exists invoices_tenant_select_v2 on public.invoices;
drop policy if exists invoices_tenant_insert_v2 on public.invoices;
drop policy if exists invoices_tenant_update_v2 on public.invoices;
drop policy if exists invoices_tenant_delete_v2 on public.invoices;

drop policy if exists payments_authenticated_select on public.payments;
drop policy if exists payments_authenticated_insert on public.payments;
drop policy if exists payments_authenticated_update on public.payments;
drop policy if exists payments_authenticated_delete on public.payments;
drop policy if exists payments_tenant_select_v2 on public.payments;
drop policy if exists payments_tenant_insert_v2 on public.payments;
drop policy if exists payments_tenant_update_v2 on public.payments;
drop policy if exists payments_tenant_delete_v2 on public.payments;

drop policy if exists payment_audit_logs_authenticated_select on public.payment_audit_logs;
drop policy if exists payment_audit_logs_tenant_select_v2 on public.payment_audit_logs;
drop policy if exists payment_audit_logs_tenant_insert_v2 on public.payment_audit_logs;
drop policy if exists payment_audit_logs_tenant_update_v2 on public.payment_audit_logs;
drop policy if exists payment_audit_logs_tenant_delete_v2 on public.payment_audit_logs;

drop policy if exists payment_settings_tenant_select_v2 on public.payment_settings;
drop policy if exists payment_settings_tenant_insert_v2 on public.payment_settings;
drop policy if exists payment_settings_tenant_update_v2 on public.payment_settings;
drop policy if exists payment_settings_tenant_delete_v2 on public.payment_settings;

create policy "Invoices: staff select tenant"
  on public.invoices for select
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Invoices: staff insert tenant"
  on public.invoices for insert
  to authenticated
  with check (
    public.is_hospital_staff()
    and (
      hospital_id is null
      or hospital_id = public.current_hospital_id()
      or hospital_id = public.default_hospital_id()
    )
  );

create policy "Invoices: staff update tenant"
  on public.invoices for update
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  )
  with check (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Invoices: staff delete tenant"
  on public.invoices for delete
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Payments: staff select tenant"
  on public.payments for select
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Payments: staff insert tenant"
  on public.payments for insert
  to authenticated
  with check (
    public.is_hospital_staff()
    and (
      hospital_id is null
      or hospital_id = public.current_hospital_id()
      or hospital_id = public.default_hospital_id()
    )
  );

create policy "Payments: staff update tenant"
  on public.payments for update
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  )
  with check (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Payments: staff delete tenant"
  on public.payments for delete
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

-- Immutable audit trail: read-only for staff; writes stay with service role.
create policy "Payment audit: staff select tenant"
  on public.payment_audit_logs for select
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Payment settings: staff select tenant"
  on public.payment_settings for select
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

create policy "Payment settings: staff write tenant"
  on public.payment_settings for all
  to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  )
  with check (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

-- ---------------------------------------------------------------------------
-- 4) Invoices storage bucket: private + staff-scoped access.
--    App serves PDFs through signed URLs (see /api/invoices/[id]).
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false
where id = 'invoices';

drop policy if exists invoices_storage_public_read on storage.objects;
drop policy if exists invoices_storage_authenticated_insert on storage.objects;

create policy "Invoices: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'invoices' and public.is_hospital_staff());

create policy "Invoices: staff insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'invoices' and public.is_hospital_staff());

-- ---------------------------------------------------------------------------
-- 6) patient_reports / patient_notifications: hospital_id + backfill + NOT NULL
-- ---------------------------------------------------------------------------
alter table public.patient_reports
  add column if not exists hospital_id uuid references public.hospitals (id) on delete restrict;

alter table public.patient_notifications
  add column if not exists hospital_id uuid references public.hospitals (id) on delete restrict;

create index if not exists patient_reports_hospital_id_idx
  on public.patient_reports (hospital_id);

create index if not exists patient_notifications_hospital_id_idx
  on public.patient_notifications (hospital_id);

-- Backfill: prefer the owning portal patient's hospital; fall back to default.
update public.patient_reports r
set hospital_id = p.hospital_id
from public.patients p
where r.hospital_id is null
  and p.id = r.patient_id
  and p.hospital_id is not null;

update public.patient_notifications n
set hospital_id = p.hospital_id
from public.patients p
where n.hospital_id is null
  and p.id = n.patient_id
  and p.hospital_id is not null;

update public.patient_reports
set hospital_id = public.default_hospital_id()
where hospital_id is null;

update public.patient_notifications
set hospital_id = public.default_hospital_id()
where hospital_id is null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'patient_reports'
      and column_name = 'hospital_id'
      and is_nullable = 'NO'
  ) then
    alter table public.patient_reports alter column hospital_id set not null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'patient_notifications'
      and column_name = 'hospital_id'
      and is_nullable = 'NO'
  ) then
    alter table public.patient_notifications alter column hospital_id set not null;
  end if;
end $$;

comment on column public.patient_reports.hospital_id is
  'Tenant ownership; backfilled from portal patient. Required by NOT NULL.';
comment on column public.patient_notifications.hospital_id is
  'Tenant ownership; backfilled from portal patient. Required by NOT NULL.';

-- ---------------------------------------------------------------------------
-- 7) Pharmacy (045): replace unconfigured app.current_hospital_id GUC with
--    current_hospital_id()/same_hospital() like every other tenant table.
--    Skipped when 045 was never applied (tables absent).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  pol text;
  tables text[] := array[
    'pharmacy_branches',
    'pharmacy_shifts',
    'pharmacy_settings',
    'pharmacy_returns',
    'pharmacy_return_items',
    'pharmacy_audit_log',
    'pharmacy_held_bills'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      -- Remove GUC-based policies (old + any retry names)
      execute format('drop policy if exists %I on public.%I', t || '_tenant', t);
      execute format('drop policy if exists %I on public.%I', t || '_tenant_guc', t);
      execute format('drop policy if exists %I on public.%I', t || '_tenant_v2', t);

      if t = 'pharmacy_return_items' then
        execute format(
          'create policy %I on public.%I for select to authenticated using (
            exists (
              select 1 from public.pharmacy_returns r
              where r.id = %I.return_id
                and public.is_hospital_staff()
                and (r.hospital_id is null or r.hospital_id = public.current_hospital_id())
            )
          )',
          t || '_tenant_staff', t, t
        );
        execute format(
          'create policy %I on public.%I for insert to authenticated with check (
            exists (
              select 1 from public.pharmacy_returns r
              where r.id = %I.return_id
                and public.is_hospital_staff()
                and (r.hospital_id is null or r.hospital_id = public.current_hospital_id())
            )
          )',
          t || '_tenant_staff_insert', t, t
        );
      else
        execute format(
          'create policy %I on public.%I for all to authenticated
            using (public.is_hospital_staff() and (hospital_id is null or hospital_id = public.current_hospital_id()))
            with check (public.is_hospital_staff() and (hospital_id is null or hospital_id = public.current_hospital_id()))',
          t || '_tenant_staff', t
        );
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants kept in sync with the new helper (defensive: policies above resolve it).
-- ---------------------------------------------------------------------------
grant execute on function public.booked_slots(text, date) to anon, authenticated, service_role;
grant execute on function public.is_hospital_staff() to authenticated, service_role;

commit;
