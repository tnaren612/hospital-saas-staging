-- ---------------------------------------------------------------------------
-- 048: Pharmacy M7 hybrid sync
--
-- Additive columns/tables so a locally committed medicine + sale can replay
-- onto Supabase without a second sale_number or a second stock deduction.
-- ---------------------------------------------------------------------------

alter table public.medicines
  add column if not exists barcode text;

create index if not exists medicines_barcode_idx
  on public.medicines (barcode);

create index if not exists medicines_sku_idx
  on public.medicines (sku);

create table if not exists public.pharmacy_customers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pharmacy_customers_hospital_idx
  on public.pharmacy_customers (hospital_id, name);

alter table public.pharmacy_customers enable row level security;

drop policy if exists pharmacy_customers_staff on public.pharmacy_customers;
create policy pharmacy_customers_staff
  on public.pharmacy_customers
  for select to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

grant select on public.pharmacy_customers to authenticated;
grant select, insert, update, delete on public.pharmacy_customers to service_role;
