-- =============================================================================
-- 013_payment_settings_and_billing_hardening.sql
-- PostgreSQL 15 / Supabase
--
-- Matches CURRENT application (payment-service.ts, invoices/payments APIs).
-- Idempotent. Additive only:
--   - never renames / removes columns
--   - never renames tables
--   - never changes patient model or existing FKs (unless tables missing)
--   - does not drop policies already applied by 012
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) payment_settings (missing from 012; required by payment-service.ts)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),
  online_payment_enabled boolean not null default false,
  cash_enabled boolean not null default true,
  razorpay_enabled boolean not null default false,
  stripe_enabled boolean not null default false,
  currency text not null default 'INR',
  tax_percentage numeric(5, 2) not null default 0
    constraint payment_settings_tax_percentage_check
      check (tax_percentage >= 0 and tax_percentage <= 100),
  hospital_name text not null default 'Sri Srinivasa Hospital',
  hospital_address text not null default 'Nellore Road, Badvel, Andhra Pradesh',
  invoice_prefix text not null default 'SSH-INV',
  gstin text not null default '',
  terms text not null default
    'Payment once made is subject to hospital refund policy. For queries contact reception.',
  razorpay_key_id text not null default '',
  stripe_publishable_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If an older partial table exists, add only missing columns (never remove/rename)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_settings'
  ) then
    alter table public.payment_settings
      add column if not exists online_payment_enabled boolean not null default false;
    alter table public.payment_settings
      add column if not exists cash_enabled boolean not null default true;
    alter table public.payment_settings
      add column if not exists razorpay_enabled boolean not null default false;
    alter table public.payment_settings
      add column if not exists stripe_enabled boolean not null default false;
    alter table public.payment_settings
      add column if not exists currency text not null default 'INR';
    alter table public.payment_settings
      add column if not exists tax_percentage numeric(5, 2) not null default 0;
    alter table public.payment_settings
      add column if not exists hospital_name text not null default 'Sri Srinivasa Hospital';
    alter table public.payment_settings
      add column if not exists hospital_address text not null default
        'Nellore Road, Badvel, Andhra Pradesh';
    alter table public.payment_settings
      add column if not exists invoice_prefix text not null default 'SSH-INV';
    alter table public.payment_settings
      add column if not exists gstin text not null default '';
    alter table public.payment_settings
      add column if not exists terms text not null default
        'Payment once made is subject to hospital refund policy. For queries contact reception.';
    alter table public.payment_settings
      add column if not exists razorpay_key_id text not null default '';
    alter table public.payment_settings
      add column if not exists stripe_publishable_key text not null default '';
    alter table public.payment_settings
      add column if not exists created_at timestamptz not null default now();
    alter table public.payment_settings
      add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- tax_percentage CHECK if not already present (safe when no violating rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_settings_tax_percentage_check'
      and conrelid = 'public.payment_settings'::regclass
  ) then
    if not exists (
      select 1 from public.payment_settings
      where tax_percentage < 0 or tax_percentage > 100
    ) then
      alter table public.payment_settings
        add constraint payment_settings_tax_percentage_check
        check (tax_percentage >= 0 and tax_percentage <= 100);
    end if;
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
end $$;

drop trigger if exists payment_settings_set_updated_at on public.payment_settings;
create trigger payment_settings_set_updated_at
  before update on public.payment_settings
  for each row execute function public.set_updated_at();

create index if not exists payment_settings_created_at_idx
  on public.payment_settings (created_at asc);

-- Seed one row so getPaymentSettings() finds data (idempotent)
insert into public.payment_settings (
  online_payment_enabled,
  cash_enabled,
  razorpay_enabled,
  stripe_enabled,
  currency,
  tax_percentage,
  hospital_name,
  hospital_address,
  invoice_prefix,
  gstin,
  terms,
  razorpay_key_id,
  stripe_publishable_key
)
select
  false,
  true,
  false,
  false,
  'INR',
  0,
  'Sri Srinivasa Hospital',
  'Nellore Road, Badvel, Andhra Pradesh',
  'SSH-INV',
  '',
  'Payment once made is subject to hospital refund policy. For queries contact reception.',
  '',
  ''
where not exists (select 1 from public.payment_settings limit 1);

-- -----------------------------------------------------------------------------
-- 2) invoices (create only if missing — same shape as 012 / payment-service)
-- -----------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  patient_id uuid null references public.hospital_patients (id) on delete set null,
  patient_name text not null default '',
  patient_phone text not null default '',
  patient_email text not null default '',
  appointment_id uuid null references public.appointments (id) on delete set null,
  package_id uuid null,
  package_name text not null default '',
  doctor_name text not null default '',
  department_name text not null default '',
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  status text not null default 'draft',
  pdf_url text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_check check (
    status in (
      'draft',
      'issued',
      'paid',
      'partially_paid',
      'void',
      'refunded'
    )
  )
);

-- Ensure status check exists on pre-created tables without it
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_status_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_status_check check (
        status in (
          'draft',
          'issued',
          'paid',
          'partially_paid',
          'void',
          'refunded'
        )
      );
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_invoice_number_key'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_invoice_number_key unique (invoice_number);
  end if;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

-- Non-negative money CHECKs (only when no violating rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_amounts_nonneg_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    if not exists (
      select 1 from public.invoices
      where subtotal < 0 or discount < 0 or tax < 0 or grand_total < 0
    ) then
      alter table public.invoices
        add constraint invoices_amounts_nonneg_check
        check (
          subtotal >= 0
          and discount >= 0
          and tax >= 0
          and grand_total >= 0
        );
    end if;
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
end $$;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create unique index if not exists invoices_invoice_number_uidx
  on public.invoices (invoice_number);

create index if not exists invoices_appointment_id_idx
  on public.invoices (appointment_id);

create index if not exists invoices_patient_id_idx
  on public.invoices (patient_id);

create index if not exists invoices_status_idx
  on public.invoices (status);

create index if not exists invoices_created_at_idx
  on public.invoices (created_at desc);

-- Missing indexes used by listInvoices / package filters
create index if not exists invoices_patient_phone_idx
  on public.invoices (patient_phone);

create index if not exists invoices_package_id_idx
  on public.invoices (package_id);

-- -----------------------------------------------------------------------------
-- 3) payments (create only if missing — same shape as 012 / payment-service)
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_reference text not null,
  appointment_id uuid null references public.appointments (id) on delete set null,
  patient_id uuid null references public.hospital_patients (id) on delete set null,
  invoice_id uuid null references public.invoices (id) on delete set null,
  package_id uuid null,
  amount numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  payment_method text not null default 'cash',
  payment_provider text not null default 'none',
  transaction_id text not null default '',
  payment_status text not null default 'pending',
  paid_at timestamptz null,
  refund_amount numeric(12, 2) null,
  refund_reason text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_method_check check (
    payment_method in ('cash', 'online', 'card', 'upi', 'other')
  ),
  constraint payments_provider_check check (
    payment_provider in ('none', 'cash', 'razorpay', 'stripe', 'mock')
  ),
  constraint payments_status_check check (
    payment_status in (
      'pending',
      'processing',
      'completed',
      'failed',
      'refund_requested',
      'refund_approved',
      'refund_rejected',
      'refunded'
    )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_payment_reference_key'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_payment_reference_key unique (payment_reference);
  end if;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

-- Ensure method / provider / status CHECKs on legacy tables
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_method_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_method_check check (
        payment_method in ('cash', 'online', 'card', 'upi', 'other')
      );
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_provider_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_provider_check check (
        payment_provider in ('none', 'cash', 'razorpay', 'stripe', 'mock')
      );
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_status_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_status_check check (
        payment_status in (
          'pending',
          'processing',
          'completed',
          'failed',
          'refund_requested',
          'refund_approved',
          'refund_rejected',
          'refunded'
        )
      );
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_amounts_nonneg_check'
      and conrelid = 'public.payments'::regclass
  ) then
    if not exists (
      select 1 from public.payments
      where amount < 0
         or discount < 0
         or tax < 0
         or total_amount < 0
         or (refund_amount is not null and refund_amount < 0)
    ) then
      alter table public.payments
        add constraint payments_amounts_nonneg_check
        check (
          amount >= 0
          and discount >= 0
          and tax >= 0
          and total_amount >= 0
          and (refund_amount is null or refund_amount >= 0)
        );
    end if;
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
end $$;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create unique index if not exists payments_payment_reference_uidx
  on public.payments (payment_reference);

create index if not exists payments_transaction_id_idx
  on public.payments (transaction_id);

create index if not exists payments_appointment_id_idx
  on public.payments (appointment_id);

create index if not exists payments_patient_id_idx
  on public.payments (patient_id);

create index if not exists payments_invoice_id_idx
  on public.payments (invoice_id);

create index if not exists payments_payment_status_idx
  on public.payments (payment_status);

create index if not exists payments_created_at_idx
  on public.payments (created_at desc);

create index if not exists payments_package_id_idx
  on public.payments (package_id);

-- -----------------------------------------------------------------------------
-- 4) appointments billing columns (additive; compatible with payment-service)
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists invoice_id uuid;

alter table public.appointments
  add column if not exists payment_status text;

update public.appointments
set payment_status = 'pending'
where payment_status is null or btrim(payment_status) = '';

alter table public.appointments
  alter column payment_status set default 'pending';

do $$
begin
  alter table public.appointments
    alter column payment_status set not null;
exception
  when others then null;
end $$;

-- FK appointments.invoice_id → invoices (only if missing; ON DELETE SET NULL)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_invoice_id_fkey'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_invoice_id_fkey
      foreign key (invoice_id)
      references public.invoices (id)
      on delete set null;
  end if;
exception
  when duplicate_object then null;
  when undefined_table then null;
  when others then null;
end $$;

create index if not exists appointments_invoice_id_idx
  on public.appointments (invoice_id);

create index if not exists appointments_payment_status_idx
  on public.appointments (payment_status);

-- CHECK matches payment-service writes: pending | paid_cash | pending_online | paid_online
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_payment_status_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    if not exists (
      select 1 from public.appointments
      where payment_status not in (
        'pending',
        'paid_cash',
        'pending_online',
        'paid_online'
      )
    ) then
      alter table public.appointments
        add constraint appointments_payment_status_check
        check (
          payment_status in (
            'pending',
            'paid_cash',
            'pending_online',
            'paid_online'
          )
        );
    end if;
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
  when check_violation then null;
end $$;

-- -----------------------------------------------------------------------------
-- 5) RLS — payment_settings only (do not replace 012 invoice/payment policies)
-- -----------------------------------------------------------------------------
alter table public.payment_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

-- payment_settings: public/anon read (getPaymentSettings may use anon client)
drop policy if exists payment_settings_public_select on public.payment_settings;
create policy payment_settings_public_select
  on public.payment_settings
  for select
  to anon, authenticated
  using (true);

-- payment_settings: admin write
drop policy if exists payment_settings_admin_write on public.payment_settings;
create policy payment_settings_admin_write
  on public.payment_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- payment_settings: service_role full access
drop policy if exists payment_settings_service_role_all on public.payment_settings;
create policy payment_settings_service_role_all
  on public.payment_settings
  for all
  to service_role
  using (true)
  with check (true);

-- invoices / payments: ensure 012-compatible policies exist (create if missing only)
-- Authenticated full access (current app; service role used by payment-service)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_authenticated_select'
  ) then
    create policy invoices_authenticated_select
      on public.invoices for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_authenticated_insert'
  ) then
    create policy invoices_authenticated_insert
      on public.invoices for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_authenticated_update'
  ) then
    create policy invoices_authenticated_update
      on public.invoices for update to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_authenticated_delete'
  ) then
    create policy invoices_authenticated_delete
      on public.invoices for delete to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_service_role_all'
  ) then
    create policy invoices_service_role_all
      on public.invoices for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_authenticated_select'
  ) then
    create policy payments_authenticated_select
      on public.payments for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_authenticated_insert'
  ) then
    create policy payments_authenticated_insert
      on public.payments for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_authenticated_update'
  ) then
    create policy payments_authenticated_update
      on public.payments for update to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_authenticated_delete'
  ) then
    create policy payments_authenticated_delete
      on public.payments for delete to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_service_role_all'
  ) then
    create policy payments_service_role_all
      on public.payments for all to service_role
      using (true) with check (true);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6) Grants (additive; match payment-service service-role + authenticated paths)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.payment_settings to authenticated;
grant all on table public.payment_settings to service_role;
grant select on table public.payment_settings to anon;

grant select, insert, update, delete on table public.invoices to authenticated;
grant all on table public.invoices to service_role;

grant select, insert, update, delete on table public.payments to authenticated;
grant all on table public.payments to service_role;

comment on table public.payment_settings is
  'Billing configuration for cash/online gateways. Read by payment-service; secrets stay in env.';

comment on table public.invoices is
  'Hospital invoices. patient_id → hospital_patients (CRM). Used by payment-service.';

comment on table public.payments is
  'Payment ledger. patient_id → hospital_patients (CRM). Used by payment-service.';
