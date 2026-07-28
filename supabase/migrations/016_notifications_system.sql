-- =============================================================================
-- Enterprise Notification System
-- notifications + notification_preferences
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid null,
  appointment_id uuid null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'in_app')),
  provider text not null default 'none',
  recipient text not null default '',
  subject text not null default '',
  message text not null default '',
  html text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'sent', 'delivered', 'failed', 'skipped', 'cancelled')),
  error_message text not null default '',
  retry_count int not null default 0,
  template_id text not null default 'generic',
  meta jsonb not null default '{}'::jsonb,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_channel_idx on public.notifications (channel);
create index if not exists notifications_status_idx on public.notifications (status);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
create index if not exists notifications_patient_idx on public.notifications (patient_id);
create index if not exists notifications_appointment_idx on public.notifications (appointment_id);
create index if not exists notifications_retry_idx
  on public.notifications (status, retry_count)
  where status = 'failed';

drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

alter table public.notifications enable row level security;

drop policy if exists "Notifications: admin all" on public.notifications;
create policy "Notifications: admin all"
  on public.notifications for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Notifications: service insert" on public.notifications;
-- Authenticated patients may read own rows when patient_id matches profile
drop policy if exists "Notifications: patient read own" on public.notifications;
create policy "Notifications: patient read own"
  on public.notifications for select
  to authenticated
  using (
    public.is_admin()
    or patient_id::text = auth.uid()::text
  );

-- Preferences
create table if not exists public.notification_preferences (
  patient_id uuid primary key,
  email boolean not null default true,
  whatsapp boolean not null default true,
  sms boolean not null default false,
  all_channels boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Notify prefs: admin all" on public.notification_preferences;
create policy "Notify prefs: admin all"
  on public.notification_preferences for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Notify prefs: patient own" on public.notification_preferences;
create policy "Notify prefs: patient own"
  on public.notification_preferences for all
  to authenticated
  using (patient_id::text = auth.uid()::text)
  with check (patient_id::text = auth.uid()::text);
