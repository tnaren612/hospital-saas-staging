-- 012_billing_payments_phase7.sql
-- Billing invoices + payments (PostgreSQL 15 / Supabase)
-- FKs: hospital_patients, appointments. Does not recreate payment_settings.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop broken prior tables that referenced non-existent public.patients
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname in ('invoices', 'payments')
      and pg_get_constraintdef(c.oid) ilike '%patients%'
      and pg_get_constraintdef(c.oid) not ilike '%hospital_patients%'
  ) then
    drop table if exists public.payments cascade;
    drop table if exists public.invoices cascade;
  end if;
end $$;

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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
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
    select 1
    from pg_constraint
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

alter table public.appointments
  add column if not exists invoice_id uuid;

alter table public.appointments
  add column if not exists payment_status text;

update public.appointments
set payment_status = 'pending'
where payment_status is null;

alter table public.appointments
  alter column payment_status set default 'pending';

do $$
begin
  alter table public.appointments
    alter column payment_status set not null;
exception
  when others then null;
end $$;

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

create index if not exists appointments_invoice_id_idx
  on public.appointments (invoice_id);

create index if not exists appointments_payment_status_idx
  on public.appointments (payment_status);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

drop policy if exists invoices_authenticated_select on public.invoices;
create policy invoices_authenticated_select
  on public.invoices
  for select
  to authenticated
  using (true);

drop policy if exists invoices_authenticated_insert on public.invoices;
create policy invoices_authenticated_insert
  on public.invoices
  for insert
  to authenticated
  with check (true);

drop policy if exists invoices_authenticated_update on public.invoices;
create policy invoices_authenticated_update
  on public.invoices
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists invoices_authenticated_delete on public.invoices;
create policy invoices_authenticated_delete
  on public.invoices
  for delete
  to authenticated
  using (true);

drop policy if exists invoices_service_role_all on public.invoices;
create policy invoices_service_role_all
  on public.invoices
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists payments_authenticated_select on public.payments;
create policy payments_authenticated_select
  on public.payments
  for select
  to authenticated
  using (true);

drop policy if exists payments_authenticated_insert on public.payments;
create policy payments_authenticated_insert
  on public.payments
  for insert
  to authenticated
  with check (true);

drop policy if exists payments_authenticated_update on public.payments;
create policy payments_authenticated_update
  on public.payments
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists payments_authenticated_delete on public.payments;
create policy payments_authenticated_delete
  on public.payments
  for delete
  to authenticated
  using (true);

drop policy if exists payments_service_role_all on public.payments;
create policy payments_service_role_all
  on public.payments
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.payments to authenticated;
grant all on table public.invoices to service_role;
grant all on table public.payments to service_role;