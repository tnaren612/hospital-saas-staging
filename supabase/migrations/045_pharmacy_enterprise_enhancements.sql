-- ============================================================================
-- Pharmacy Enterprise Enhancements
-- Branches, Shifts, POS, Receipts, Returns, Refunds, Settings, Audit
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pharmacy Branches (multi-location pharmacy support)
-- ----------------------------------------------------------------------------
create table if not exists public.pharmacy_branches (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  email text,
  manager_name text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, code)
);

create index if not exists idx_pharmacy_branches_hospital on public.pharmacy_branches(hospital_id);
create index if not exists idx_pharmacy_branches_active on public.pharmacy_branches(hospital_id, is_active);

-- ----------------------------------------------------------------------------
-- 2. Pharmacy Shifts (working shifts for staff)
-- ----------------------------------------------------------------------------
create table if not exists public.pharmacy_shifts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  branch_id uuid references public.pharmacy_branches(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  shift_date date not null default current_date,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  opening_cash numeric(12,2) not null default 0,
  closing_cash numeric(12,2),
  total_sales numeric(12,2) not null default 0,
  total_returns numeric(12,2) not null default 0,
  total_transactions integer not null default 0,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pharmacy_shifts_hospital on public.pharmacy_shifts(hospital_id);
create index if not exists idx_pharmacy_shifts_user on public.pharmacy_shifts(user_id, shift_date);
create index if not exists idx_pharmacy_shifts_status on public.pharmacy_shifts(hospital_id, status);

-- ----------------------------------------------------------------------------
-- 3. Pharmacy Settings (per-hospital configuration)
-- ----------------------------------------------------------------------------
create table if not exists public.pharmacy_settings (
  hospital_id uuid primary key references public.hospitals(id) on delete cascade,
  -- Receipt configuration
  receipt_header text default '',
  receipt_footer text default 'Thank you for your purchase',
  receipt_paper_size text default '80mm' check (receipt_paper_size in ('58mm','80mm','A4')),
  show_logo boolean default true,
  show_hospital_address boolean default true,
  show_phone boolean default true,
  show_gst boolean default true,
  show_drug_license boolean default true,
  show_doctor_name boolean default true,
  show_patient_address boolean default false,
  show_batch_details boolean default true,
  show_expiry boolean default true,
  show_mrp boolean default true,
  show_savings boolean default true,
  show_barcode boolean default true,
  show_qr_code boolean default true,
  show_return_policy boolean default true,
  return_policy_text text default 'Medicines once sold will not be returned',
  -- Tax configuration
  default_gst_percent numeric(5,2) default 0,
  inclusive_tax boolean default false,
  -- Discount configuration
  max_discount_percent numeric(5,2) default 10,
  require_discount_approval boolean default false,
  -- Inventory alerts
  low_stock_threshold integer default 10,
  expiry_alert_days integer default 90,
  critical_expiry_days integer default 30,
  -- POS configuration
  enable_barcode_scanner boolean default true,
  enable_keyboard_shortcuts boolean default true,
  enable_sound_effects boolean default true,
  auto_print_receipt boolean default false,
  require_patient_for_sale boolean default false,
  allow_credit_sales boolean default false,
  -- Payment methods
  enable_cash boolean default true,
  enable_upi boolean default true,
  enable_card boolean default true,
  enable_insurance boolean default true,
  enable_credit boolean default false,
  enable_wallet boolean default false,
  -- License & compliance
  drug_license_number text default '',
  gst_number text default '',
  pharmacist_name text default '',
  pharmacist_registration text default '',
  -- Independent mode
  standalone_mode boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Pharmacy Returns / Refunds
-- ----------------------------------------------------------------------------
create table if not exists public.pharmacy_returns (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  return_number text not null,
  original_sale_id uuid references public.pharmacy_sales(id) on delete set null,
  original_sale_number text,
  patient_name text not null,
  patient_phone text,
  patient_age integer,
  return_reason text not null,
  return_type text not null default 'refund' check (return_type in ('refund','exchange','credit_note')),
  subtotal numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  refund_method text,
  refund_reference text,
  status text not null default 'pending' check (status in ('pending','approved','completed','rejected')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  processed_by uuid references auth.users(id),
  processed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, return_number)
);

create index if not exists idx_pharmacy_returns_hospital on public.pharmacy_returns(hospital_id);
create index if not exists idx_pharmacy_returns_sale on public.pharmacy_returns(original_sale_id);
create index if not exists idx_pharmacy_returns_status on public.pharmacy_returns(hospital_id, status);

create table if not exists public.pharmacy_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.pharmacy_returns(id) on delete cascade,
  medicine_id uuid references public.medicines(id) on delete set null,
  medicine_name text not null,
  batch_number text,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  total_price numeric(12,2) not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pharmacy_return_items_return on public.pharmacy_return_items(return_id);

-- ----------------------------------------------------------------------------
-- 5. Pharmacy Audit Log
-- ----------------------------------------------------------------------------
create table if not exists public.pharmacy_audit_log (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pharmacy_audit_hospital on public.pharmacy_audit_log(hospital_id, created_at desc);
create index if not exists idx_pharmacy_audit_entity on public.pharmacy_audit_log(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 6. Pharmacy Held Bills (park transactions)
-- ----------------------------------------------------------------------------
create table if not exists public.pharmacy_held_bills (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  branch_id uuid references public.pharmacy_branches(id) on delete set null,
  shift_id uuid references public.pharmacy_shifts(id) on delete set null,
  reference text not null,
  customer_name text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  discount numeric(12,2) default 0,
  notes text,
  held_by uuid references auth.users(id),
  held_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pharmacy_held_bills_hospital on public.pharmacy_held_bills(hospital_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. Enhance existing pharmacy_sales table
-- ----------------------------------------------------------------------------
alter table public.pharmacy_sales
  add column if not exists branch_id uuid references public.pharmacy_branches(id) on delete set null,
  add column if not exists shift_id uuid references public.pharmacy_shifts(id) on delete set null,
  add column if not exists cashier_id uuid references auth.users(id) on delete set null,
  add column if not exists cashier_name text,
  add column if not exists customer_phone text,
  add column if not exists prescription_number text,
  add column if not exists doctor_name text,
  add column if not exists doctor_reg_no text,
  add column if not exists discount numeric(12,2) default 0,
  add column if not exists tax numeric(12,2) default 0,
  add column if not exists subtotal numeric(12,2) default 0,
  add column if not exists amount_paid numeric(12,2) default 0,
  add column if not exists amount_returned numeric(12,2) default 0,
  add column if not exists payment_reference text,
  add column if not exists receipt_printed boolean default false,
  add column if not exists receipt_printed_at timestamptz,
  add column if not exists receipt_count integer default 0,
  add column if not exists is_returned boolean default false,
  add column if not exists returned_amount numeric(12,2) default 0,
  add column if not exists notes text;

create index if not exists idx_pharmacy_sales_branch on public.pharmacy_sales(branch_id);
create index if not exists idx_pharmacy_sales_shift on public.pharmacy_sales(shift_id);
create index if not exists idx_pharmacy_sales_cashier on public.pharmacy_sales(cashier_id);
create index if not exists idx_pharmacy_sales_phone on public.pharmacy_sales(customer_phone);

-- ----------------------------------------------------------------------------
-- 8. Enhance medicines table
-- ----------------------------------------------------------------------------
alter table public.medicines
  add column if not exists branch_id uuid references public.pharmacy_branches(id) on delete set null,
  add column if not exists drug_license_number text,
  add column if not exists schedule text check (schedule in ('OTC','H','H1','X') or schedule is null),
  add column if not exists composition text,
  add column if not exists side_effects text,
  add column if not exists storage_conditions text,
  add column if not exists min_stock_level integer default 0,
  add column if not exists max_stock_level integer,
  add column if not exists last_purchased_at timestamptz,
  add column if not exists last_sold_at timestamptz,
  add column if not exists total_sold integer default 0;

create index if not exists idx_medicines_branch on public.medicines(branch_id);
create index if not exists idx_medicines_schedule on public.medicines(schedule);

-- ----------------------------------------------------------------------------
-- 9. RLS Policies
-- ----------------------------------------------------------------------------
alter table public.pharmacy_branches enable row level security;
alter table public.pharmacy_shifts enable row level security;
alter table public.pharmacy_settings enable row level security;
alter table public.pharmacy_returns enable row level security;
alter table public.pharmacy_return_items enable row level security;
alter table public.pharmacy_audit_log enable row level security;
alter table public.pharmacy_held_bills enable row level security;

-- Drop existing policies if they exist (idempotent)
drop policy if exists "pharmacy_branches_tenant" on public.pharmacy_branches;
drop policy if exists "pharmacy_shifts_tenant" on public.pharmacy_shifts;
drop policy if exists "pharmacy_settings_tenant" on public.pharmacy_settings;
drop policy if exists "pharmacy_returns_tenant" on public.pharmacy_returns;
drop policy if exists "pharmacy_return_items_tenant" on public.pharmacy_return_items;
drop policy if exists "pharmacy_audit_log_tenant" on public.pharmacy_audit_log;
drop policy if exists "pharmacy_held_bills_tenant" on public.pharmacy_held_bills;

-- Create tenant isolation policies
create policy "pharmacy_branches_tenant" on public.pharmacy_branches
  using (hospital_id = (current_setting('app.current_hospital_id', true))::uuid);

create policy "pharmacy_shifts_tenant" on public.pharmacy_shifts
  using (hospital_id = (current_setting('app.current_hospital_id', true))::uuid);

create policy "pharmacy_settings_tenant" on public.pharmacy_settings
  using (hospital_id = (current_setting('app.current_hospital_id', true))::uuid);

create policy "pharmacy_returns_tenant" on public.pharmacy_returns
  using (hospital_id = (current_setting('app.current_hospital_id', true))::uuid);

create policy "pharmacy_return_items_tenant" on public.pharmacy_return_items
  using (exists (
    select 1 from public.pharmacy_returns r
    where r.id = pharmacy_return_items.return_id
    and r.hospital_id = (current_setting('app.current_hospital_id', true))::uuid
  ));

create policy "pharmacy_audit_log_tenant" on public.pharmacy_audit_log
  using (hospital_id = (current_setting('app.current_hospital_id', true))::uuid);

create policy "pharmacy_held_bills_tenant" on public.pharmacy_held_bills
  using (hospital_id = (current_setting('app.current_hospital_id', true))::uuid);

-- ----------------------------------------------------------------------------
-- 10. Helper functions
-- ----------------------------------------------------------------------------
create or replace function public.get_pharmacy_settings(p_hospital_id uuid)
returns public.pharmacy_settings
language sql
stable
security definer
as $$
  select * from public.pharmacy_settings where hospital_id = p_hospital_id;
$$;

create or replace function public.ensure_pharmacy_settings(p_hospital_id uuid)
returns public.pharmacy_settings
language plpgsql
security definer
as $$
declare
  v_settings public.pharmacy_settings;
begin
  select * into v_settings from public.pharmacy_settings where hospital_id = p_hospital_id;
  if not found then
    insert into public.pharmacy_settings (hospital_id) values (p_hospital_id)
    returning * into v_settings;
  end if;
  return v_settings;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. Comments
-- ----------------------------------------------------------------------------
comment on table public.pharmacy_branches is 'Multi-location pharmacy branches';
comment on table public.pharmacy_shifts is 'Pharmacy staff working shifts with cash tracking';
comment on table public.pharmacy_settings is 'Per-hospital pharmacy configuration';
comment on table public.pharmacy_returns is 'Medicine return/refund transactions';
comment on table public.pharmacy_audit_log is 'Audit trail for pharmacy operations';
comment on table public.pharmacy_held_bills is 'Parked/Pending POS transactions';
