-- =============================================================================
-- PHASE 2: Lab, Pharmacy, Prescriptions, Hospital Bills, Staff Roles
-- Safe / idempotent for Supabase PostgreSQL
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roles: extend profiles.role check if present
-- -----------------------------------------------------------------------------
do $$
begin
  -- Drop restrictive role checks if any; allow Phase 2 roles
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
        'receptionist',
        'lab_technician',
        'pharmacist',
        'billing',
        'finance',
        'hr',
        'manager',
        'patient'
      )
    );
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in (
        'admin', 'doctor', 'receptionist', 'lab_technician', 'pharmacist', 'staff'
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

-- -----------------------------------------------------------------------------
-- LAB
-- -----------------------------------------------------------------------------
create table if not exists public.lab_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  category_id uuid null references public.lab_categories (id) on delete set null,
  code text not null default '',
  name text not null,
  slug text not null unique,
  description text not null default '',
  sample_type text not null default 'blood',
  price numeric(12, 2) not null default 0,
  turnaround_hours int not null default 24,
  is_package boolean not null default false,
  package_items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_technicians (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null references public.profiles (id) on delete set null,
  full_name text not null,
  phone text not null default '',
  email text not null default '',
  specialization text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  patient_id uuid null references public.hospital_patients (id) on delete set null,
  patient_name text not null default '',
  patient_phone text not null default '',
  patient_email text not null default '',
  doctor_id uuid null,
  doctor_name text not null default '',
  appointment_id uuid null references public.appointments (id) on delete set null,
  ordered_by uuid null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'sample_collected',
      'processing',
      'completed',
      'delivered',
      'cancelled'
    )),
  priority text not null default 'normal',
  notes text not null default '',
  total_amount numeric(12, 2) not null default 0,
  collected_at timestamptz null,
  completed_at timestamptz null,
  delivered_at timestamptz null,
  technician_id uuid null references public.lab_technicians (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.lab_orders (id) on delete cascade,
  test_id uuid null references public.lab_tests (id) on delete set null,
  test_name text not null,
  price numeric(12, 2) not null default 0,
  status text not null default 'pending',
  result_summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lab_samples (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.lab_orders (id) on delete cascade,
  sample_code text not null default '',
  sample_type text not null default 'blood',
  collected_at timestamptz null,
  collected_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.lab_orders (id) on delete cascade,
  report_number text not null unique,
  patient_id uuid null,
  patient_name text not null default '',
  title text not null default 'Lab Report',
  status text not null default 'draft'
    check (status in ('draft', 'final', 'delivered', 'amended')),
  report_url text not null default '',
  findings text not null default '',
  result_data jsonb not null default '{}'::jsonb,
  verified_by text not null default '',
  reported_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lab_orders_status_idx on public.lab_orders (status);
create index if not exists lab_orders_patient_idx on public.lab_orders (patient_id);
create index if not exists lab_orders_created_idx on public.lab_orders (created_at desc);
create index if not exists lab_reports_patient_idx on public.lab_reports (patient_id);
create index if not exists lab_tests_name_idx on public.lab_tests using gin (to_tsvector('english', name));

-- -----------------------------------------------------------------------------
-- PHARMACY
-- -----------------------------------------------------------------------------
create table if not exists public.pharmacy_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  category_id uuid null references public.pharmacy_categories (id) on delete set null,
  name text not null,
  generic_name text not null default '',
  manufacturer text not null default '',
  batch_number text not null default '',
  sku text not null default '',
  unit text not null default 'strip',
  purchase_price numeric(12, 2) not null default 0,
  selling_price numeric(12, 2) not null default 0,
  stock_qty int not null default 0,
  reorder_level int not null default 10,
  expiry_date date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_stock_movements (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references public.medicines (id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out', 'adjust')),
  quantity int not null,
  reference text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid null references public.pharmacy_suppliers (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'ordered', 'received', 'cancelled')),
  total_amount numeric(12, 2) not null default 0,
  ordered_at timestamptz null,
  received_at timestamptz null,
  notes text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  patient_id uuid null,
  patient_name text not null default '',
  patient_phone text not null default '',
  prescription_id uuid null,
  sale_type text not null default 'walk_in'
    check (sale_type in ('walk_in', 'prescription')),
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  payment_method text not null default 'cash',
  payment_status text not null default 'paid'
    check (payment_status in ('pending', 'paid', 'refunded', 'cancelled')),
  line_items jsonb not null default '[]'::jsonb,
  sold_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists medicines_name_idx on public.medicines (name);
create index if not exists medicines_expiry_idx on public.medicines (expiry_date);
create index if not exists medicines_stock_idx on public.medicines (stock_qty);
create index if not exists pharmacy_sales_created_idx on public.pharmacy_sales (created_at desc);

-- -----------------------------------------------------------------------------
-- PRESCRIPTIONS
-- -----------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  prescription_number text not null unique,
  patient_id uuid null references public.hospital_patients (id) on delete set null,
  patient_name text not null default '',
  patient_phone text not null default '',
  patient_age int null,
  patient_gender text not null default '',
  doctor_id uuid null,
  doctor_name text not null default '',
  doctor_reg_no text not null default '',
  appointment_id uuid null references public.appointments (id) on delete set null,
  diagnosis text not null default '',
  notes text not null default '',
  follow_up_date date null,
  medicines jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('draft', 'active', 'dispensed', 'cancelled')),
  pdf_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id);
create index if not exists prescriptions_doctor_idx on public.prescriptions (doctor_id);
create index if not exists prescriptions_created_idx on public.prescriptions (created_at desc);

-- Link pharmacy_sales.prescription_id after prescriptions exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pharmacy_sales_prescription_id_fkey'
  ) then
    alter table public.pharmacy_sales
      add constraint pharmacy_sales_prescription_id_fkey
      foreign key (prescription_id) references public.prescriptions (id)
      on delete set null;
  end if;
exception when others then null;
end $$;

-- -----------------------------------------------------------------------------
-- HOSPITAL BILLS (extends billing; works alongside invoices)
-- -----------------------------------------------------------------------------
create table if not exists public.hospital_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  patient_id uuid null references public.hospital_patients (id) on delete set null,
  patient_name text not null default '',
  patient_phone text not null default '',
  patient_email text not null default '',
  appointment_id uuid null references public.appointments (id) on delete set null,
  doctor_name text not null default '',
  consultation_fee numeric(12, 2) not null default 0,
  lab_charges numeric(12, 2) not null default 0,
  pharmacy_charges numeric(12, 2) not null default 0,
  other_charges numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  gst_percent numeric(5, 2) not null default 0,
  gst_amount numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in (
      'cash', 'upi', 'gpay', 'phonepe', 'paytm',
      'credit_card', 'debit_card', 'net_banking', 'razorpay', 'other'
    )),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'refunded', 'cancelled', 'partial')),
  line_items jsonb not null default '[]'::jsonb,
  notes text not null default '',
  pdf_url text not null default '',
  paid_at timestamptz null,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hospital_bills_status_idx on public.hospital_bills (payment_status);
create index if not exists hospital_bills_created_idx on public.hospital_bills (created_at desc);
create index if not exists hospital_bills_patient_idx on public.hospital_bills (patient_id);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'lab_categories','lab_tests','lab_technicians','lab_orders','lab_reports',
    'pharmacy_suppliers','medicines','pharmacy_purchase_orders','prescriptions','hospital_bills'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.lab_categories enable row level security;
alter table public.lab_tests enable row level security;
alter table public.lab_technicians enable row level security;
alter table public.lab_orders enable row level security;
alter table public.lab_order_items enable row level security;
alter table public.lab_samples enable row level security;
alter table public.lab_reports enable row level security;
alter table public.pharmacy_categories enable row level security;
alter table public.pharmacy_suppliers enable row level security;
alter table public.medicines enable row level security;
alter table public.pharmacy_stock_movements enable row level security;
alter table public.pharmacy_purchase_orders enable row level security;
alter table public.pharmacy_sales enable row level security;
alter table public.prescriptions enable row level security;
alter table public.hospital_bills enable row level security;

-- Staff full access policies (admin + clinical roles)
do $$
declare
  t text;
begin
  foreach t in array array[
    'lab_categories','lab_tests','lab_technicians','lab_orders','lab_order_items',
    'lab_samples','lab_reports','pharmacy_categories','pharmacy_suppliers','medicines',
    'pharmacy_stock_movements','pharmacy_purchase_orders','pharmacy_sales',
    'prescriptions','hospital_bills'
  ]
  loop
    execute format('drop policy if exists %I_staff_all on public.%I', t, t);
    execute format(
      'create policy %I_staff_all on public.%I for all using (public.is_staff() or public.is_admin()) with check (public.is_staff() or public.is_admin())',
      t, t
    );
  end loop;
end $$;

-- Patients read own prescriptions / reports / bills by phone match is handled in app via service role;
-- optional authenticated read by patient profile email later.

-- -----------------------------------------------------------------------------
-- Seed lab categories + common tests
-- -----------------------------------------------------------------------------
insert into public.lab_categories (name, slug, description, sort_order)
values
  ('Blood Tests', 'blood-tests', 'Haematology and biochemistry', 1),
  ('Imaging', 'imaging', 'X-Ray, MRI, CT, Ultrasound', 2),
  ('Cardiac', 'cardiac', 'ECG, Echo', 3),
  ('Infectious', 'infectious', 'COVID and related', 4),
  ('Packages', 'packages', 'Combined test packages', 5)
on conflict (slug) do nothing;

insert into public.lab_tests (category_id, code, name, slug, sample_type, price, is_package)
select c.id, v.code, v.name, v.slug, v.sample_type, v.price, v.is_package
from (
  values
    ('blood-tests', 'BLOOD', 'Blood Test', 'blood-test', 'blood', 300, false),
    ('blood-tests', 'CBC', 'CBC', 'cbc', 'blood', 350, false),
    ('blood-tests', 'LIPID', 'Lipid Profile', 'lipid-profile', 'blood', 600, false),
    ('blood-tests', 'SUGAR', 'Blood Sugar', 'blood-sugar', 'blood', 150, false),
    ('blood-tests', 'THY', 'Thyroid Profile', 'thyroid', 'blood', 700, false),
    ('blood-tests', 'URINE', 'Urine Test', 'urine-test', 'urine', 200, false),
    ('blood-tests', 'VIT', 'Vitamin Tests', 'vitamin-tests', 'blood', 1200, false),
    ('imaging', 'XRAY', 'X-Ray', 'x-ray', 'na', 500, false),
    ('imaging', 'MRI', 'MRI', 'mri', 'na', 4500, false),
    ('imaging', 'CT', 'CT Scan', 'ct-scan', 'na', 3500, false),
    ('imaging', 'USG', 'Ultrasound', 'ultrasound', 'na', 900, false),
    ('cardiac', 'ECG', 'ECG', 'ecg', 'na', 400, false),
    ('cardiac', 'ECHO', 'Echo', 'echo', 'na', 1800, false),
    ('infectious', 'COVID', 'COVID Test', 'covid-test', 'swab', 500, false),
    ('packages', 'PKG1', 'Basic Health Package', 'basic-health-package', 'blood', 1999, true)
) as v(cat_slug, code, name, slug, sample_type, price, is_package)
join public.lab_categories c on c.slug = v.cat_slug
on conflict (slug) do nothing;

insert into public.pharmacy_categories (name, description)
values
  ('Antibiotics', 'Antimicrobial medicines'),
  ('Analgesics', 'Pain relief'),
  ('Cardiac', 'Heart related'),
  ('Respiratory', 'Asthma / COPD'),
  ('Vitamins', 'Supplements'),
  ('General', 'General medicines')
on conflict (name) do nothing;
