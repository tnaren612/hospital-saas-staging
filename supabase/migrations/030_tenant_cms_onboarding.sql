-- Tenant website CMS and onboarding foundation.
-- Content is tenant-owned, versionable, and deny-by-default under RLS.

-- Self-contained tenant helper. Some existing projects applied the SaaS
-- foundation without later tenant-helper migrations.
alter table public.profiles
  add column if not exists hospital_id uuid
  references public.hospitals(id) on delete set null;

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
    (
      select h.id
      from public.hospitals h
      where h.slug = 'default' and h.status = 'active'
      order by h.created_at asc
      limit 1
    )
  );
$$;

grant execute on function public.current_hospital_id()
  to authenticated, service_role;

create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  page_key text not null,
  title text not null default '',
  slug text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  content jsonb not null default '{"blocks":[]}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, page_key),
  unique (hospital_id, slug)
);

create table if not exists public.cms_page_versions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  page_id uuid not null references public.cms_pages(id) on delete cascade,
  version integer not null,
  title text not null default '',
  content jsonb not null default '{"blocks":[]}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, version)
);

create table if not exists public.cms_navigation (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  location text not null check (location in ('header', 'footer', 'utility')),
  items jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (hospital_id, location)
);

create table if not exists public.cms_announcements (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  title text not null,
  message text not null,
  link_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_onboarding (
  hospital_id uuid primary key references public.hospitals(id) on delete cascade,
  current_step integer not null default 1 check (current_step between 1 and 6),
  completed_steps integer[] not null default '{}',
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  checklist jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists cms_pages_tenant_status_idx
  on public.cms_pages (hospital_id, status, page_key);
create index if not exists cms_versions_tenant_page_idx
  on public.cms_page_versions (hospital_id, page_id, version desc);
create index if not exists cms_announcements_tenant_status_idx
  on public.cms_announcements (hospital_id, status, starts_at, ends_at);

alter table public.cms_pages enable row level security;
alter table public.cms_page_versions enable row level security;
alter table public.cms_navigation enable row level security;
alter table public.cms_announcements enable row level security;
alter table public.tenant_onboarding enable row level security;

drop policy if exists cms_pages_public_read on public.cms_pages;
create policy cms_pages_public_read on public.cms_pages
  for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.hospitals h
      where h.id = hospital_id and h.status = 'active'
    )
  );
drop policy if exists cms_pages_tenant_admin on public.cms_pages;
create policy cms_pages_tenant_admin on public.cms_pages
  for all to authenticated
  using (public.is_admin() and hospital_id = public.current_hospital_id())
  with check (public.is_admin() and hospital_id = public.current_hospital_id());

drop policy if exists cms_versions_tenant_admin on public.cms_page_versions;
create policy cms_versions_tenant_admin on public.cms_page_versions
  for all to authenticated
  using (public.is_admin() and hospital_id = public.current_hospital_id())
  with check (public.is_admin() and hospital_id = public.current_hospital_id());

drop policy if exists cms_navigation_public_read on public.cms_navigation;
create policy cms_navigation_public_read on public.cms_navigation
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.hospitals h
      where h.id = hospital_id and h.status = 'active'
    )
  );
drop policy if exists cms_navigation_tenant_admin on public.cms_navigation;
create policy cms_navigation_tenant_admin on public.cms_navigation
  for all to authenticated
  using (public.is_admin() and hospital_id = public.current_hospital_id())
  with check (public.is_admin() and hospital_id = public.current_hospital_id());

drop policy if exists cms_announcements_public_read on public.cms_announcements;
create policy cms_announcements_public_read on public.cms_announcements
  for select to anon, authenticated
  using (
    status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );
drop policy if exists cms_announcements_tenant_admin on public.cms_announcements;
create policy cms_announcements_tenant_admin on public.cms_announcements
  for all to authenticated
  using (public.is_admin() and hospital_id = public.current_hospital_id())
  with check (public.is_admin() and hospital_id = public.current_hospital_id());

drop policy if exists onboarding_tenant_admin on public.tenant_onboarding;
create policy onboarding_tenant_admin on public.tenant_onboarding
  for all to authenticated
  using (public.is_admin() and hospital_id = public.current_hospital_id())
  with check (public.is_admin() and hospital_id = public.current_hospital_id());

grant select on public.cms_pages, public.cms_navigation,
  public.cms_announcements to anon, authenticated;
grant all on public.cms_pages, public.cms_page_versions,
  public.cms_navigation, public.cms_announcements,
  public.tenant_onboarding to service_role;
