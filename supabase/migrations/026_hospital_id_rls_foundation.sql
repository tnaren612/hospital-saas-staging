-- =============================================================================
-- Phase Security — hospital_id foundation + tenant RLS helpers
-- Backfills existing rows to default hospital. Safe / idempotent.
-- =============================================================================

-- Ensure default hospital exists (migration 025 should have created tables)
insert into public.hospitals (slug, name, hospital_type, status)
select 'default', 'Default Hospital', 'multi_specialty', 'active'
where not exists (select 1 from public.hospitals where slug = 'default');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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
      select p.hospital_id
      from public.profiles p
      where p.id = auth.uid()
        and p.hospital_id is not null
      limit 1
    ),
    public.default_hospital_id()
  );
$$;

/**
 * Tenant match for a row.
 * - null hospital_id treated as legacy (visible during transition)
 * - admin / super_admin (is_admin) can access all tenants
 * - otherwise must match current_hospital_id()
 */
-- Note: same_hospital tightened in 027/028 (no is_admin cross-tenant).
create or replace function public.same_hospital(row_hospital_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or row_hospital_id is null
    or row_hospital_id = public.current_hospital_id();
$$;

comment on function public.current_hospital_id() is
  'Active hospital for auth.uid() profile, else default hospital';
comment on function public.same_hospital(uuid) is
  'RLS helper: row belongs to current hospital (or legacy null / admin)';

-- ---------------------------------------------------------------------------
-- Add hospital_id columns (nullable first, then backfill)
-- ---------------------------------------------------------------------------
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
    'lab_tests',
    'medicines',
    'prescriptions',
    'hospital_bills',
    'finance_expenses',
    'hr_employees',
    'hr_leave_requests',
    'hr_attendance',
    'admin_notifications',
    'gallery_images',
    'blog_articles',
    'articles',
    'health_packages'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'alter table public.%I add column if not exists hospital_id uuid references public.hospitals (id) on delete restrict',
        t
      );
      execute format(
        'create index if not exists %I on public.%I (hospital_id)',
        t || '_hospital_id_idx',
        t
      );
      -- Backfill
      execute format(
        'update public.%I set hospital_id = public.default_hospital_id() where hospital_id is null and public.default_hospital_id() is not null',
        t
      );
    end if;
  end loop;
end $$;

-- Profiles: ensure hospital_id backfilled for staff
update public.profiles
set hospital_id = public.default_hospital_id()
where hospital_id is null
  and public.default_hospital_id() is not null;

-- ---------------------------------------------------------------------------
-- RLS tenant policies (additive — do not drop existing public policies)
-- Authenticated staff scoped by same_hospital
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'hospital_doctors',
    'hospital_patients',
    'departments',
    'doctor_availability',
    'lab_orders',
    'medicines',
    'prescriptions',
    'hospital_bills',
    'finance_expenses',
    'hr_employees'
  ];
  pol text;
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
      pol := t || '_tenant_all';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.same_hospital(hospital_id)) with check (public.same_hospital(hospital_id) or hospital_id is null or hospital_id = public.current_hospital_id())',
        pol, t
      );
    end if;
  end loop;
end $$;

-- Appointments: keep public insert; add tenant select/update for authenticated
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'hospital_id'
  ) then
    alter table public.appointments enable row level security;
    drop policy if exists appointments_tenant_select on public.appointments;
    create policy appointments_tenant_select
      on public.appointments for select to authenticated
      using (public.same_hospital(hospital_id));
    drop policy if exists appointments_tenant_update on public.appointments;
    create policy appointments_tenant_update
      on public.appointments for update to authenticated
      using (public.same_hospital(hospital_id))
      with check (public.same_hospital(hospital_id) or hospital_id = public.current_hospital_id());
    drop policy if exists appointments_tenant_delete on public.appointments;
    create policy appointments_tenant_delete
      on public.appointments for delete to authenticated
      using (public.same_hospital(hospital_id));
  end if;
end $$;

grant execute on function public.default_hospital_id() to anon, authenticated, service_role;
grant execute on function public.current_hospital_id() to authenticated, service_role;
grant execute on function public.same_hospital(uuid) to authenticated, service_role;
