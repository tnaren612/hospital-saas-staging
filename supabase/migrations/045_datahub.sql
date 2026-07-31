-- ============================================================================
-- Data Management & Import/Export Engine
-- Additive migration (never modify previous migrations).
-- Tenant isolation via hospital_id + RLS. Admin-only (super_admin / admin).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. datahub_config_rows — generic keyed-JSON rows for config-backed modules
--    (specialties, roles, pricing, taxes, payment-methods).
-- ---------------------------------------------------------------------------
create table if not exists public.datahub_config_rows (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  module_key text not null,
  ref_key text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, module_key, ref_key)
);

create or replace function public.datahub_config_rows_before_write() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists datahub_config_rows_before_write on public.datahub_config_rows;
create trigger datahub_config_rows_before_write
  before insert or update on public.datahub_config_rows
  for each row execute function public.datahub_config_rows_before_write();

alter table public.datahub_config_rows enable row level security;
drop policy if exists datahub_config_rows_tenant_staff on public.datahub_config_rows;
create policy datahub_config_rows_tenant_staff on public.datahub_config_rows for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin'])
);

-- ---------------------------------------------------------------------------
-- 2. datahub_mappings — reusable Excel-column -> DB-field import mappings.
-- ---------------------------------------------------------------------------
create table if not exists public.datahub_mappings (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  module_key text not null,
  column_map jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.datahub_mappings_before_write() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists datahub_mappings_before_write on public.datahub_mappings;
create trigger datahub_mappings_before_write
  before insert or update on public.datahub_mappings
  for each row execute function public.datahub_mappings_before_write();

alter table public.datahub_mappings enable row level security;
drop policy if exists datahub_mappings_tenant_staff on public.datahub_mappings;
create policy datahub_mappings_tenant_staff on public.datahub_mappings for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin'])
);

-- ---------------------------------------------------------------------------
-- 3. datahub_audit — immutable log of every import/export/backup/restore/etc.
-- ---------------------------------------------------------------------------
create table if not exists public.datahub_audit (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null
    check (action in ('import','export','backup','restore','template','mapping')),
  module_key text not null default '*',
  file_name text,
  rows_imported integer not null default 0,
  rows_exported integer not null default 0,
  rows_updated integer not null default 0,
  rows_failed integer not null default 0,
  rows_duplicates integer not null default 0,
  errors integer not null default 0,
  ip_address text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists datahub_audit_created_at_idx on public.datahub_audit (created_at desc);
create index if not exists datahub_audit_module_idx on public.datahub_audit (module_key);

alter table public.datahub_audit enable row level security;
drop policy if exists datahub_audit_tenant_staff on public.datahub_audit;
create policy datahub_audit_tenant_staff on public.datahub_audit for all to authenticated
using (
  (hospital_id is null or hospital_id = public.current_hospital_id())
  and public.has_role(array['super_admin','admin'])
)
with check (
  (hospital_id is null or hospital_id = public.current_hospital_id())
  and public.has_role(array['super_admin','admin'])
);

-- ---------------------------------------------------------------------------
-- 4. datahub_backups — metadata for created database backups.
-- ---------------------------------------------------------------------------
create table if not exists public.datahub_backups (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  file_name text,
  rows integer not null default 0,
  size_bytes bigint not null default 0,
  checksum text,
  status text not null default 'ok'
    check (status in ('ok','failed')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists datahub_backups_created_at_idx on public.datahub_backups (created_at desc);

alter table public.datahub_backups enable row level security;
drop policy if exists datahub_backups_tenant_staff on public.datahub_backups;
create policy datahub_backups_tenant_staff on public.datahub_backups for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin'])
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.datahub_config_rows to authenticated;
grant select, insert, update, delete on public.datahub_mappings to authenticated;
grant select, insert, update, delete on public.datahub_audit to authenticated;
grant select, insert, update, delete on public.datahub_backups to authenticated;

-- ---------------------------------------------------------------------------
-- Data Management configuration — tenant-scoped on hospital_settings.
-- ---------------------------------------------------------------------------
alter table public.hospital_settings add column if not exists data_management jsonb;
