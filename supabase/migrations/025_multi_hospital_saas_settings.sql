-- =============================================================================
-- Multi-hospital SaaS foundation: hospitals + JSON settings (config-only)
-- No code deploy required to rebrand a hospital after this migration.
-- =============================================================================

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  hospital_type text not null default 'multi_specialty'
    check (hospital_type in (
      'clinic',
      'diagnostic_center',
      'dental_clinic',
      'eye_hospital',
      'children_hospital',
      'cardiology',
      'orthopedic',
      'cancer_hospital',
      'government_hospital',
      'private_hospital',
      'multi_specialty',
      'super_specialty',
      'veterinary',
      'home_care',
      'telemedicine'
    )),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hospitals_status_idx on public.hospitals (status);

create table if not exists public.hospital_settings (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  -- Entire config is JSON for zero-schema deploys when adding new keys
  branding jsonb not null default '{}'::jsonb,
  contact jsonb not null default '{}'::jsonb,
  localization jsonb not null default '{}'::jsonb,
  legal jsonb not null default '{}'::jsonb,
  modules jsonb not null default '{}'::jsonb,
  prefixes jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  email jsonb not null default '{}'::jsonb,
  storage jsonb not null default '{}'::jsonb,
  auth_providers jsonb not null default '{}'::jsonb,
  templates jsonb not null default '{}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  social jsonb not null default '{}'::jsonb,
  working_hours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create or replace function public.touch_hospital_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hospital_settings_touch on public.hospital_settings;
create trigger hospital_settings_touch
  before update on public.hospital_settings
  for each row execute function public.touch_hospital_settings();

alter table public.hospitals enable row level security;
alter table public.hospital_settings enable row level security;

-- Public read of active hospital branding (anon marketing site)
drop policy if exists hospitals_public_read on public.hospitals;
create policy hospitals_public_read on public.hospitals
  for select to anon, authenticated
  using (status = 'active');

drop policy if exists hospital_settings_public_read on public.hospital_settings;
create policy hospital_settings_public_read on public.hospital_settings
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.hospitals h
      where h.id = hospital_id and h.status = 'active'
    )
  );

drop policy if exists hospitals_admin_write on public.hospitals;
create policy hospitals_admin_write on public.hospitals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists hospital_settings_admin_write on public.hospital_settings;
create policy hospital_settings_admin_write on public.hospital_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.hospitals to anon, authenticated;
grant select on public.hospital_settings to anon, authenticated;
grant all on public.hospitals to service_role;
grant all on public.hospital_settings to service_role;

-- Optional tenant columns for future row isolation (nullable = single-tenant OK)
alter table public.profiles
  add column if not exists hospital_id uuid references public.hospitals (id) on delete set null;

create index if not exists profiles_hospital_id_idx
  on public.profiles (hospital_id)
  where hospital_id is not null;

comment on table public.hospitals is
  'Tenant hospitals — unlimited; switch via HOSPITAL_SLUG / host mapping';
comment on table public.hospital_settings is
  'All hospital branding, modules, payments, SMTP, templates — admin-editable only';
