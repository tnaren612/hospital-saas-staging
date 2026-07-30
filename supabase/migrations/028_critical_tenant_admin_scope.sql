-- =============================================================================
-- CRITICAL C-01 / C-06 — Scope tenant RLS: hospital admin is NOT global
-- Migration scripts only. Apply manually after 027.
-- Does not delete production data.
-- =============================================================================
-- Changes same_hospital(): remove blanket is_admin() cross-tenant bypass.
-- Hospital-scoped admin/staff only see rows matching profiles.hospital_id
-- (via current_hospital_id()). Platform ops use service_role (bypasses RLS).
-- =============================================================================

create or replace function public.default_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.hospitals
  where slug = 'default' and status = 'active'
  order by created_at asc
  limit 1;
$$;

create or replace function public.current_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.hospital_id from public.profiles p
      where p.id = auth.uid() and p.hospital_id is not null
      limit 1
    ),
    public.default_hospital_id()
  );
$$;

-- Tenant match only — no global admin bypass (C-06)
create or replace function public.same_hospital(row_hospital_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_hospital_id() is not null
    and (
      row_hospital_id = public.current_hospital_id()
      -- legacy null rows still visible until backfill complete (H-07)
      or row_hospital_id is null
    );
$$;

comment on function public.same_hospital(uuid) is
  'Tenant isolation: row hospital matches session hospital. No admin cross-tenant bypass. Service role bypasses RLS.';

-- Tighten insert/update policies: remove is_admin() insert-any-hospital
do $$
declare
  t text;
  pol text;
  tables text[] := array[
    'hospital_patients',
    'hospital_doctors',
    'appointments',
    'hr_employees',
    'hr_attendance',
    'hr_leave_requests',
    'finance_expenses',
    'invoices',
    'payments',
    'departments',
    'doctor_availability',
    'lab_orders',
    'medicines',
    'prescriptions',
    'hospital_bills',
    'payment_settings'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'hospital_id'
    ) then
      execute format('alter table public.%I enable row level security', t);

      pol := t || '_tenant_select_v2';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.same_hospital(hospital_id))',
        pol, t
      );

      pol := t || '_tenant_insert_v2';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (
          hospital_id is null
          or hospital_id = public.current_hospital_id()
          or hospital_id = public.default_hospital_id()
        )',
        pol, t
      );

      pol := t || '_tenant_update_v2';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for update to authenticated
          using (public.same_hospital(hospital_id))
          with check (
            hospital_id is null
            or hospital_id = public.current_hospital_id()
          )',
        pol, t
      );

      pol := t || '_tenant_delete_v2';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.same_hospital(hospital_id))',
        pol, t
      );
    end if;
  end loop;
end $$;

grant execute on function public.default_hospital_id() to anon, authenticated, service_role;
grant execute on function public.current_hospital_id() to authenticated, service_role;
grant execute on function public.same_hospital(uuid) to authenticated, service_role;
