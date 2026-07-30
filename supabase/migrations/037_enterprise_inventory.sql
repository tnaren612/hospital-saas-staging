create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null, description text not null default '', status text not null default 'active' check(status in ('active','inactive')),
  created_at timestamptz not null default now(), unique(hospital_id,name)
);
create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  code text not null, name text not null, location_type text not null default 'store_room'
    check(location_type in ('warehouse','store_room','pharmacy','laboratory','radiology','emergency','department')),
  status text not null default 'active' check(status in ('active','inactive')), created_at timestamptz not null default now(),
  unique(hospital_id,code), unique(hospital_id,name)
);
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  supplier_code text not null, name text not null, tax_number text, address text not null default '',
  payment_terms text not null default '', rating numeric(3,2) not null default 0 check(rating between 0 and 5),
  total_orders integer not null default 0, on_time_deliveries integer not null default 0,
  status text not null default 'active' check(status in ('active','inactive','blocked')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(hospital_id,supplier_code), unique(hospital_id,name)
);
create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade, name text not null, designation text not null default '',
  email text, phone text, is_primary boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_code text not null, barcode text, name text not null, generic_name text not null default '', description text not null default '',
  category_id uuid references public.inventory_categories(id) on delete set null, unit text not null, manufacturer text not null default '',
  preferred_supplier_id uuid references public.suppliers(id) on delete set null, hsn_code text, gst_percent numeric(5,2) not null default 0 check(gst_percent between 0 and 100),
  purchase_price numeric(14,2) not null default 0 check(purchase_price>=0), selling_price numeric(14,2) not null default 0 check(selling_price>=0),
  minimum_stock numeric(14,3) not null default 0 check(minimum_stock>=0), maximum_stock numeric(14,3) check(maximum_stock is null or maximum_stock>=minimum_stock),
  reorder_level numeric(14,3) not null default 0 check(reorder_level>=0), expiry_tracking boolean not null default false,
  batch_tracking boolean not null default false, serial_tracking boolean not null default false,
  status text not null default 'active' check(status in ('active','inactive','discontinued')),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(hospital_id,item_code), unique(hospital_id,barcode)
);
create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity numeric(14,3) not null default 0 check(quantity>=0), reserved_quantity numeric(14,3) not null default 0 check(reserved_quantity>=0 and reserved_quantity<=quantity),
  updated_at timestamptz not null default now(), unique(hospital_id,item_id,location_id)
);
create table if not exists public.inventory_expiry_batches (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  batch_number text not null, serial_number text, manufacture_date date, expiry_date date,
  quantity numeric(14,3) not null default 0 check(quantity>=0), recalled boolean not null default false, recall_reason text,
  created_at timestamptz not null default now(), unique(hospital_id,item_id,location_id,batch_number,serial_number)
);
create table if not exists public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  movement_type text not null check(movement_type in ('receipt','issue','transfer_in','transfer_out','adjustment','damage','expired','lost','return')),
  quantity numeric(14,3) not null check(quantity>0), direction text not null check(direction in ('in','out')),
  reference_type text, reference_id uuid, batch_number text, serial_number text, unit_cost numeric(14,2) not null default 0,
  reason text not null default '', performed_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  po_number text not null, supplier_id uuid not null references public.suppliers(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  status text not null default 'draft' check(status in ('draft','submitted','approved','partially_received','received','cancelled')),
  order_date date not null default current_date, expected_date date, subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0, notes text not null default '',
  created_by uuid references auth.users(id) on delete set null, approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(hospital_id,po_number)
);
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict, ordered_quantity numeric(14,3) not null check(ordered_quantity>0),
  received_quantity numeric(14,3) not null default 0 check(received_quantity>=0 and received_quantity<=ordered_quantity),
  unit_price numeric(14,2) not null check(unit_price>=0), gst_percent numeric(5,2) not null default 0 check(gst_percent between 0 and 100),
  unique(purchase_order_id,item_id)
);
create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  grn_number text not null, purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict, location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0), batch_number text, serial_number text, expiry_date date,
  unit_cost numeric(14,2) not null check(unit_cost>=0), received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(), unique(hospital_id,grn_number,item_id,batch_number)
);
create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  adjustment_number text not null, item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  adjustment_type text not null check(adjustment_type in ('increase','decrease','damage','expired','lost','return')),
  quantity numeric(14,3) not null check(quantity>0), reason text not null, approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(hospital_id,adjustment_number)
);
create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  transfer_number text not null, item_id uuid not null references public.inventory_items(id) on delete restrict,
  from_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  to_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0), status text not null default 'completed' check(status in ('requested','approved','in_transit','completed','cancelled')),
  batch_number text, serial_number text, requested_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), completed_at timestamptz,
  check(from_location_id<>to_location_id), unique(hospital_id,transfer_number)
);
create table if not exists public.inventory_reorder_rules (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  location_id uuid references public.inventory_locations(id) on delete cascade, reorder_level numeric(14,3) not null check(reorder_level>=0),
  reorder_quantity numeric(14,3) not null check(reorder_quantity>0), preferred_supplier_id uuid references public.suppliers(id) on delete set null,
  auto_reorder boolean not null default false, active boolean not null default true, unique(hospital_id,item_id,location_id)
);
create table if not exists public.inventory_audit_logs (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, action text not null, actor_id uuid references auth.users(id) on delete set null,
  old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);

create index if not exists inventory_items_search_idx on public.inventory_items(hospital_id,name,item_code,barcode);
create index if not exists inventory_stock_lookup_idx on public.inventory_stock(hospital_id,item_id,location_id);
create index if not exists inventory_batch_expiry_idx on public.inventory_expiry_batches(hospital_id,expiry_date) where quantity>0;
create index if not exists inventory_movement_date_idx on public.inventory_stock_movements(hospital_id,created_at desc);

create or replace function public.inventory_apply_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare current_qty numeric;
begin
  if new.hospital_id<>public.current_hospital_id() then raise exception 'Tenant mismatch'; end if;
  insert into public.inventory_stock(hospital_id,item_id,location_id,quantity)
  values(new.hospital_id,new.item_id,new.location_id,0) on conflict(hospital_id,item_id,location_id) do nothing;
  select quantity into current_qty from public.inventory_stock where hospital_id=new.hospital_id and item_id=new.item_id and location_id=new.location_id for update;
  if new.direction='out' and current_qty<new.quantity then raise exception 'Insufficient stock'; end if;
  update public.inventory_stock set quantity=quantity+(case when new.direction='in' then new.quantity else -new.quantity end),updated_at=now()
  where hospital_id=new.hospital_id and item_id=new.item_id and location_id=new.location_id;
  return new;
end $$;
drop trigger if exists inventory_apply_movement on public.inventory_stock_movements;
create trigger inventory_apply_movement before insert on public.inventory_stock_movements for each row execute function public.inventory_apply_movement();

create or replace function public.inventory_numbering() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='purchase_orders' and nullif(new.po_number,'') is null then new.po_number:='PO-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8)); end if;
  if tg_table_name='goods_receipts' and nullif(new.grn_number,'') is null then new.grn_number:='GRN-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8)); end if;
  if tg_table_name='inventory_adjustments' and nullif(new.adjustment_number,'') is null then new.adjustment_number:='ADJ-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8)); end if;
  if tg_table_name='inventory_transfers' and nullif(new.transfer_number,'') is null then new.transfer_number:='TRF-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8)); end if;
  return new;
end $$;
create trigger inventory_number_po before insert on public.purchase_orders for each row execute function public.inventory_numbering();
create trigger inventory_number_grn before insert on public.goods_receipts for each row execute function public.inventory_numbering();
create trigger inventory_number_adjustment before insert on public.inventory_adjustments for each row execute function public.inventory_numbering();
create trigger inventory_number_transfer before insert on public.inventory_transfers for each row execute function public.inventory_numbering();

create or replace function public.inventory_generic_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.inventory_audit_logs(hospital_id,entity_type,entity_id,action,actor_id,old_data,new_data)
  values(coalesce(new.hospital_id,old.hospital_id),tg_table_name,coalesce(new.id,old.id),lower(tg_op),auth.uid(),
    case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
  return coalesce(new,old);
end $$;
do $$ declare t text; begin
  foreach t in array array['inventory_items','suppliers','purchase_orders','goods_receipts','inventory_adjustments','inventory_transfers'] loop
    execute format('drop trigger if exists inventory_audit_%I on public.%I',t,t);
    execute format('create trigger inventory_audit_%I after insert or update or delete on public.%I for each row execute function public.inventory_generic_audit()',t,t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['inventory_categories','inventory_items','inventory_locations','inventory_stock','inventory_stock_movements',
    'purchase_orders','purchase_order_items','suppliers','supplier_contacts','goods_receipts','inventory_adjustments',
    'inventory_transfers','inventory_expiry_batches','inventory_reorder_rules','inventory_audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists inventory_tenant_staff_%I on public.%I',t,t);
    execute format('create policy inventory_tenant_staff_%I on public.%I for all to authenticated using (hospital_id=public.current_hospital_id() and public.has_role(array[''super_admin'',''admin'',''pharmacist'',''manager'',''billing''])) with check (hospital_id=public.current_hospital_id() and public.has_role(array[''super_admin'',''admin'',''pharmacist'',''manager'',''billing'']))',t,t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

insert into public.inventory_locations(hospital_id,code,name,location_type)
select h.id,v.code,v.name,v.kind from public.hospitals h cross join (values
 ('MAIN','Main Warehouse','warehouse'),('PHARM','Pharmacy Store','pharmacy'),('LAB','Laboratory Store','laboratory'),
 ('RAD','Radiology Store','radiology'),('ER','Emergency Store','emergency')) v(code,name,kind)
where h.status='active' on conflict(hospital_id,code) do nothing;
