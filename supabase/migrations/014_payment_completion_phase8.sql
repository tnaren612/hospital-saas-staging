-- 014_payment_completion_phase8.sql
-- Payment completion workflow: audit logs, webhook idempotency, storage, status hardening
-- PostgreSQL 15 / Supabase. Pure ASCII. Idempotent.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Expand payments.payment_status to include paid (alias of completed success)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'payments_status_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments drop constraint payments_status_check;
  end if;
exception
  when undefined_table then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter table public.payments
    add constraint payments_status_check check (
      payment_status in (
        'pending',
        'processing',
        'paid',
        'completed',
        'failed',
        'refund_requested',
        'refund_approved',
        'refund_rejected',
        'refunded'
      )
    );
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Expand appointments.payment_status to include paid
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'appointments_payment_status_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments drop constraint appointments_payment_status_check;
  end if;
exception
  when undefined_table then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter table public.appointments
    add constraint appointments_payment_status_check check (
      payment_status in (
        'pending',
        'paid',
        'paid_cash',
        'pending_online',
        'paid_online',
        'failed',
        'refunded'
      )
    );
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

-- -----------------------------------------------------------------------------
-- 3) payment_audit_logs
-- -----------------------------------------------------------------------------
create table if not exists public.payment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid null references public.payments (id) on delete set null,
  invoice_id uuid null references public.invoices (id) on delete set null,
  appointment_id uuid null references public.appointments (id) on delete set null,
  event_type text not null,
  actor text not null default 'system',
  ip_address text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_audit_logs_payment_id_idx
  on public.payment_audit_logs (payment_id);

create index if not exists payment_audit_logs_event_type_idx
  on public.payment_audit_logs (event_type);

create index if not exists payment_audit_logs_created_at_idx
  on public.payment_audit_logs (created_at desc);

alter table public.payment_audit_logs enable row level security;

drop policy if exists payment_audit_logs_service_role_all on public.payment_audit_logs;
create policy payment_audit_logs_service_role_all
  on public.payment_audit_logs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists payment_audit_logs_authenticated_select on public.payment_audit_logs;
create policy payment_audit_logs_authenticated_select
  on public.payment_audit_logs
  for select
  to authenticated
  using (true);

grant select on table public.payment_audit_logs to authenticated;
grant all on table public.payment_audit_logs to service_role;

-- -----------------------------------------------------------------------------
-- 4) payment_webhook_events (idempotency for Razorpay webhooks)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  process_result text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz null,
  constraint payment_webhook_events_event_id_key unique (provider, event_id)
);

create index if not exists payment_webhook_events_type_idx
  on public.payment_webhook_events (event_type);

create index if not exists payment_webhook_events_created_at_idx
  on public.payment_webhook_events (created_at desc);

alter table public.payment_webhook_events enable row level security;

drop policy if exists payment_webhook_events_service_role_all on public.payment_webhook_events;
create policy payment_webhook_events_service_role_all
  on public.payment_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

grant all on table public.payment_webhook_events to service_role;

-- -----------------------------------------------------------------------------
-- 5) invoices storage bucket (private; app serves via signed or public URL)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  true,
  10485760,
  array['application/pdf', 'text/html', 'application/octet-stream']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow service role full access; authenticated read of own paths is optional
drop policy if exists invoices_storage_service_all on storage.objects;
create policy invoices_storage_service_all
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'invoices')
  with check (bucket_id = 'invoices');

drop policy if exists invoices_storage_public_read on storage.objects;
create policy invoices_storage_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'invoices');

drop policy if exists invoices_storage_authenticated_insert on storage.objects;
create policy invoices_storage_authenticated_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'invoices');

comment on table public.payment_audit_logs is
  'Immutable audit trail for payment verify, webhook, refund, and completion events.';

comment on table public.payment_webhook_events is
  'Razorpay webhook idempotency ledger. Unique (provider, event_id).';
