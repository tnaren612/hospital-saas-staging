-- =============================================================================
-- Phase 1 Auth hardening
-- - Never trust client metadata for role (privilege-escalation fix)
-- - Auth audit events table
-- =============================================================================

-- -----------------------------------------------------------------------------
-- handle_new_user: public signup ALWAYS creates patient profiles
-- Staff/admin roles must be assigned only by super_admin/admin (service role)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_phone text;
begin
  v_full_name := nullif(
    trim(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    )),
    ''
  );

  v_phone := nullif(
    trim(coalesce(
      new.raw_user_meta_data->>'phone',
      new.phone,
      ''
    )),
    ''
  );

  insert into public.profiles (id, full_name, email, phone, role)
  values (
    new.id,
    v_full_name,
    lower(new.email),
    v_phone,
    'patient'  -- NEVER read role from raw_user_meta_data
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates patient profile on signup. Role is always patient; never taken from user metadata.';

-- -----------------------------------------------------------------------------
-- Auth audit events (immutable operational log)
-- -----------------------------------------------------------------------------
create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  role text,
  ip_address text,
  user_agent text,
  success boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_created_at_idx
  on public.auth_events (created_at desc);

create index if not exists auth_events_event_type_idx
  on public.auth_events (event_type);

create index if not exists auth_events_user_id_idx
  on public.auth_events (user_id);

create index if not exists auth_events_email_idx
  on public.auth_events (email);

alter table public.auth_events enable row level security;

drop policy if exists auth_events_admin_select on public.auth_events;
create policy auth_events_admin_select
  on public.auth_events
  for select
  to authenticated
  using (public.is_admin());

-- Inserts only via service role (no direct client inserts)
drop policy if exists auth_events_service_insert on public.auth_events;
-- service_role bypasses RLS; grant for clarity
grant select on table public.auth_events to authenticated;
grant all on table public.auth_events to service_role;

comment on table public.auth_events is
  'Auth audit trail: login, logout, register, password reset, role denial.';
