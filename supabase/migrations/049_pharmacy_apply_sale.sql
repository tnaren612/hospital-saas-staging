-- ---------------------------------------------------------------------------
-- 049: Atomic cloud sale apply (M7 review items 1–2)
--
-- One transaction: insert pharmacy_sales (or reuse existing sale_number),
-- decrement medicines.stock_qty with a guarded UPDATE, write a stock-out
-- movement. Replay of the same sale_number completes missing outs only.
-- ---------------------------------------------------------------------------

create or replace function public.pharmacy_decrement_stock(
  p_id uuid,
  p_hospital_id uuid,
  p_qty integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Insufficient stock. Available: 0';
  end if;
  update public.medicines
     set stock_qty = stock_qty - p_qty
   where id = p_id
     and hospital_id = p_hospital_id
     and stock_qty >= p_qty;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Insufficient stock. Available: 0';
  end if;
  return v_updated;
end;
$$;

create or replace function public.pharmacy_apply_sale(
  p_hospital_id uuid,
  p_sale_number text,
  p_sale jsonb,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.pharmacy_sales%rowtype;
  v_line jsonb;
  v_med uuid;
  v_qty integer;
  v_updated integer;
  v_exists integer;
  v_created boolean := false;
  v_sale_id uuid;
begin
  if p_sale_number is null or length(trim(p_sale_number)) = 0 then
    raise exception 'sale_number required';
  end if;
  if p_hospital_id is null then
    raise exception 'hospital_id required';
  end if;

  select * into v_sale
    from public.pharmacy_sales
   where sale_number = trim(p_sale_number)
   limit 1;

  if found then
    if v_sale.hospital_id is distinct from p_hospital_id then
      raise exception 'conflict';
    end if;
  else
    v_sale_id := coalesce(nullif(p_sale->>'id', '')::uuid, gen_random_uuid());
    insert into public.pharmacy_sales (
      id,
      hospital_id,
      sale_number,
      patient_name,
      patient_phone,
      sale_type,
      subtotal,
      discount,
      tax,
      grand_total,
      payment_method,
      payment_status,
      line_items,
      sold_by
    ) values (
      v_sale_id,
      p_hospital_id,
      trim(p_sale_number),
      coalesce(p_sale->>'patient_name', 'Walk-in Customer'),
      coalesce(p_sale->>'patient_phone', ''),
      coalesce(nullif(p_sale->>'sale_type', ''), 'walk_in'),
      coalesce((p_sale->>'subtotal')::numeric, 0),
      coalesce((p_sale->>'discount')::numeric, 0),
      coalesce((p_sale->>'tax')::numeric, 0),
      coalesce((p_sale->>'grand_total')::numeric, 0),
      coalesce(nullif(p_sale->>'payment_method', ''), 'cash'),
      coalesce(nullif(p_sale->>'payment_status', ''), 'paid'),
      coalesce(p_sale->'line_items', '[]'::jsonb),
      coalesce(p_sale->>'sold_by', '')
    )
    on conflict (sale_number) do nothing;
    v_created := true;
    select * into v_sale
      from public.pharmacy_sales
     where sale_number = trim(p_sale_number)
     limit 1;
    if v_sale.hospital_id is distinct from p_hospital_id then
      raise exception 'conflict';
    end if;
  end if;

  if v_sale.id is null then
    raise exception 'Apply failed';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    begin
      v_med := nullif(v_line->>'medicine_id', '')::uuid;
    exception when others then
      v_med := null;
    end;
    v_qty := coalesce((v_line->>'qty')::integer, 0);
    if v_med is null or v_qty <= 0 then
      continue;
    end if;

    select count(*) into v_exists
      from public.pharmacy_stock_movements
     where reference = p_sale_number
       and medicine_id = v_med
       and movement_type = 'out';
    if v_exists > 0 then
      continue;
    end if;

    update public.medicines
       set stock_qty = stock_qty - v_qty
     where id = v_med
       and hospital_id = p_hospital_id
       and stock_qty >= v_qty;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'Insufficient stock for %', coalesce(v_line->>'name', 'item');
    end if;

    insert into public.pharmacy_stock_movements (
      medicine_id, movement_type, quantity, reference
    ) values (
      v_med, 'out', v_qty, p_sale_number
    );
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'sale', to_jsonb(v_sale)
  );
end;
$$;

revoke all on function public.pharmacy_decrement_stock(uuid, uuid, integer) from public;
revoke all on function public.pharmacy_apply_sale(uuid, text, jsonb, jsonb) from public;
grant execute on function public.pharmacy_decrement_stock(uuid, uuid, integer) to service_role;
grant execute on function public.pharmacy_apply_sale(uuid, text, jsonb, jsonb) to service_role;
