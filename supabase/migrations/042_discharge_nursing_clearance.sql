alter table public.discharge_clearances
  drop constraint if exists discharge_clearances_clearance_type_check;
alter table public.discharge_clearances
  add constraint discharge_clearances_clearance_type_check
  check(clearance_type in ('clinical','nursing','radiology','pharmacy','billing','insurance','inventory'));

create or replace function public.discharge_seed_clearances() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.discharge_clearances(hospital_id,discharge_id,clearance_type)
  select new.hospital_id,new.id,x
  from unnest(array['clinical','nursing','radiology','pharmacy','billing','insurance','inventory']) x;
  return new;
end $$;

insert into public.discharge_clearances(hospital_id,discharge_id,clearance_type)
select hospital_id,id,'nursing' from public.discharge_cases
on conflict(discharge_id,clearance_type) do nothing;
