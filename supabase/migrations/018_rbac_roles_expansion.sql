-- =============================================================================
-- RBAC expansion: super_admin, billing, finance, hr, manager
-- Removes legacy "staff" from allowed roles (migrate staff → receptionist)
-- =============================================================================

-- Migrate legacy staff → receptionist
update public.profiles
set role = 'receptionist'
where lower(coalesce(role, '')) = 'staff';

do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
exception when undefined_table then null; when undefined_object then null;
end $$;

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check
    check (
      lower(role) in (
        'super_admin',
        'admin',
        'doctor',
        'patient',
        'receptionist',
        'lab_technician',
        'pharmacist',
        'billing',
        'finance',
        'hr',
        'manager'
      )
    );
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- "staff" = any hospital operational role (name kept for SQL compatibility)
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in (
        'super_admin',
        'admin',
        'doctor',
        'receptionist',
        'lab_technician',
        'pharmacist',
        'billing',
        'finance',
        'hr',
        'manager'
      )
  );
$$;

create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = any (
        select lower(unnest(roles))
      )
  );
$$;
