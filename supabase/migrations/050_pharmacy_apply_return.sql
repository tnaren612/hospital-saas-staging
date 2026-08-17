-- ---------------------------------------------------------------------------
-- 050: Atomic cloud return apply (production issues 7 companion + 8)
--
-- One transaction: insert pharmacy_returns (or reuse hospital+return_number),
-- increment medicines.stock_qty with a hospital-scoped UPDATE, write a
-- stock-in movement. Replay of the same return_number completes missing
-- restocks only — never a second movement or a second increment.
-- ---------------------------------------------------------------------------

create or replace function public.pharmacy_increment_stock(
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
    raise exception 'Invalid restock quantity';
  end if;
  update public.medicines
     set stock_qty = stock_qty + p_qty
   where id = p_id
     and hospital_id = p_hospital_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Medicine not found';
  end if;
  return v_updated;
end;
$$;

create or replace function public.pharmacy_apply_return(
  p_hospital_id uuid,
  p_return_number text,
  p_return jsonb,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return public.pharmacy_returns%rowtype;
  v_line jsonb;
  v_med uuid;
  v_qty integer;
  v_updated integer;
  v_exists integer;
  v_created boolean := false;
  v_return_id uuid;
  v_return_number text;
  v_unit numeric;
  v_total numeric;
begin
  if p_return_number is null or length(trim(p_return_number)) = 0 then
    raise exception 'return_number required';
  end if;
  if p_hospital_id is null then
    raise exception 'hospital_id required';
  end if;

  v_return_number := trim(p_return_number);

  select * into v_return
    from public.pharmacy_returns
   where return_number = v_return_number
     and hospital_id = p_hospital_id
   limit 1;

  if not found then
    v_return_id := coalesce(nullif(p_return->>'id', '')::uuid, gen_random_uuid());
    insert into public.pharmacy_returns (
      id,
      hospital_id,
      return_number,
      original_sale_number,
      patient_name,
      patient_phone,
      return_reason,
      return_type,
      subtotal,
      refund_amount,
      refund_method,
      status,
      notes
    ) values (
      v_return_id,
      p_hospital_id,
      v_return_number,
      nullif(p_return->>'original_sale_number', ''),
      coalesce(p_return->>'patient_name', 'Walk-in Customer'),
      coalesce(p_return->>'patient_phone', ''),
      coalesce(p_return->>'return_reason', 'return'),
      coalesce(nullif(p_return->>'return_type', ''), 'refund'),
      coalesce((p_return->>'subtotal')::numeric, 0),
      coalesce((p_return->>'refund_amount')::numeric, 0),
      coalesce(nullif(p_return->>'refund_method', ''), 'cash'),
      coalesce(nullif(p_return->>'status', ''), 'completed'),
      p_return->>'notes'
    )
    on conflict (hospital_id, return_number) do nothing;
    v_created := true;
    select * into v_return
      from public.pharmacy_returns
     where return_number = v_return_number
       and hospital_id = p_hospital_id
     limit 1;
  end if;

  if v_return.id is null then
    raise exception 'Apply failed';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    begin
      v_med := nullif(v_line->>'medicine_id', '')::uuid;
    exception when others then
      v_med := null;
    end;
    v_qty := coalesce(
      nullif(v_line->>'qty', '')::integer,
      nullif(v_line->>'quantity', '')::integer,
      0
    );
    if v_med is null or v_qty <= 0 then
      continue;
    end if;
    v_unit := coalesce(
      nullif(v_line->>'unit_price', '')::numeric,
      nullif(v_line->>'price', '')::numeric,
      0
    );
    v_total := coalesce(
      nullif(v_line->>'total_price', '')::numeric,
      round(v_unit * v_qty, 2)
    );

    select count(*) into v_exists
      from public.pharmacy_stock_movements
     where reference = v_return_number
       and medicine_id = v_med
       and movement_type = 'in';
    if v_exists > 0 then
      continue;
    end if;

    update public.medicines
       set stock_qty = stock_qty + v_qty
     where id = v_med
       and hospital_id = p_hospital_id;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'Medicine not found for %', coalesce(v_line->>'name', 'item');
    end if;

    insert into public.pharmacy_stock_movements (
      medicine_id, movement_type, quantity, reference
    ) values (
      v_med, 'in', v_qty, v_return_number
    );

    insert into public.pharmacy_return_items (
      return_id, medicine_id, medicine_name, quantity, unit_price, total_price
    )
    select
      v_return.id,
      v_med,
      coalesce(v_line->>'medicine_name', v_line->>'name', 'item'),
      v_qty,
      v_unit,
      v_total
    where not exists (
      select 1
        from public.pharmacy_return_items
       where return_id = v_return.id
         and medicine_id = v_med
    );
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'return', to_jsonb(v_return)
  );
end;
$$;

revoke all on function public.pharmacy_increment_stock(uuid, uuid, integer) from public;
revoke all on function public.pharmacy_apply_return(uuid, text, jsonb, jsonb) from public;
grant execute on function public.pharmacy_increment_stock(uuid, uuid, integer) to service_role;
grant execute on function public.pharmacy_apply_return(uuid, text, jsonb, jsonb) to service_role;
