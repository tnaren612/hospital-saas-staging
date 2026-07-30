-- =============================================================================
-- FULL hospital_id multi-tenant isolation
-- Migration scripts only — apply manually in Supabase SQL Editor.
-- Does not delete production data. Backfills NULL hospital_id → default hospital.
-- Depends on: 025 (hospitals), 026 (helpers + some columns). Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helpers (recreate for environments that only apply 027)
-- ---------------------------------------------------------------------------
insert into public.hospitals (slug, name, hospital_type, status)
select 'default', 'Default Hospital', 'multi_specialty', 'active'
where exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'hospitals'
)
and not exists (select 1 from public.hospitals where slug = 'default');

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

-- Tenant match only (C-06): no blanket is_admin() cross-tenant bypass.
-- Platform ops use service_role. Prefer migration 028 if 027 already applied.
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
      or row_hospital_id is null  -- legacy rows until backfill complete
    );
$$;

create or replace function public.tenant_insert_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_hospital_id(), public.default_hospital_id());
$$;

-- ---------------------------------------------------------------------------
-- 2) Ensure hospital_id on ALL tenant-owned tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    -- Clinical / ops
    'appointments',
    'hospital_doctors',
    'hospital_patients',
    'departments',
    'doctor_availability',
    'patients',
    'patient_documents',
    -- Phase 2
    'lab_orders',
    'lab_tests',
    'lab_order_items',
    'lab_reports',
    'lab_samples',
    'medicines',
    'pharmacy_sales',
    'pharmacy_stock_movements',
    'prescriptions',
    'hospital_bills',
    -- Finance / HR
    'finance_expenses',
    'hr_employees',
    'hr_leave_requests',
    'hr_attendance',
    -- Billing / payments
    'invoices',
    'payments',
    'payment_settings',
    'payment_audit_logs',
    'payment_webhook_events',
    -- CMS / ops
    'admin_notifications',
    'gallery_images',
    'blog_articles',
    'articles',
    'health_packages',
    'testimonials',
    'contact_messages',
    'career_applications',
    'profiles'
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
      -- Backfill only NULL rows (does not rewrite existing tenant ids)
      execute format(
        'update public.%I set hospital_id = public.default_hospital_id() where hospital_id is null and public.default_hospital_id() is not null',
        t
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Enable RLS + tenant policies (explicit list from requirements + payments)
-- ---------------------------------------------------------------------------
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

      -- SELECT
      pol := t || '_tenant_select_v2';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.same_hospital(hospital_id))',
        pol, t
      );

      -- INSERT
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

      -- UPDATE
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

      -- DELETE
      pol := t || '_tenant_delete_v2';
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.same_hospital(hospital_id))',
        pol, t
      );
    end if;
  end loop;
end $$;

-- Service role continues to bypass RLS (Supabase default).
-- Public anon booking should continue via service role in Next.js APIs.

grant execute on function public.default_hospital_id() to anon, authenticated, service_role;
grant execute on function public.current_hospital_id() to authenticated, service_role;
grant execute on function public.same_hospital(uuid) to authenticated, service_role;
grant execute on function public.tenant_insert_hospital_id() to authenticated, service_role;

comment on function public.same_hospital(uuid) is
  'Tenant isolation: row hospital matches session hospital. No admin cross-tenant bypass.';
