create table if not exists public.ipd_wards (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  ward_type text not null default 'general'
    check (ward_type in ('general','private','icu','nicu','maternity','isolation')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique(hospital_id,name)
);
create table if not exists public.ipd_beds (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.ipd_wards(id) on delete restrict,
  bed_number text not null,
  status text not null default 'available'
    check (status in ('available','occupied','reserved','maintenance','cleaning')),
  daily_rate numeric(12,2) not null default 0 check (daily_rate >= 0),
  created_at timestamptz not null default now(),
  unique(hospital_id,bed_number)
);
create table if not exists public.ipd_admissions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  admission_number text not null,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  admitting_doctor_id uuid references auth.users(id) on delete restrict,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  bed_id uuid references public.ipd_beds(id) on delete restrict,
  admission_type text not null default 'planned'
    check (admission_type in ('planned','emergency','transfer')),
  status text not null default 'admitted'
    check (status in ('admitted','transferred','discharge_planned','discharged','cancelled')),
  reason text not null,
  provisional_diagnosis text not null default '',
  care_notes text not null default '',
  admitted_at timestamptz not null default now(),
  expected_discharge_date date,
  discharged_at timestamptz,
  discharge_summary text,
  discharge_instructions text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id,admission_number)
);
create table if not exists public.ipd_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  admission_id uuid not null references public.ipd_admissions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ipd_admissions_tenant_status_idx on public.ipd_admissions(hospital_id,status,admitted_at desc);
create index if not exists ipd_beds_tenant_status_idx on public.ipd_beds(hospital_id,status);
create index if not exists ipd_events_admission_idx on public.ipd_events(hospital_id,admission_id,created_at);

create or replace function public.ipd_before_write() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' and nullif(new.admission_number,'') is null then
    new.admission_number := 'IPD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ipd_before_write on public.ipd_admissions;
create trigger ipd_before_write before insert or update on public.ipd_admissions
for each row execute function public.ipd_before_write();

create or replace function public.ipd_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.ipd_events(hospital_id,admission_id,actor_id,event_type,details)
  values(coalesce(new.hospital_id,old.hospital_id),coalesce(new.id,old.id),auth.uid(),
    lower(tg_op),jsonb_build_object('old',case when tg_op<>'INSERT' then to_jsonb(old) end,'new',case when tg_op<>'DELETE' then to_jsonb(new) end));
  return coalesce(new,old);
end $$;
drop trigger if exists ipd_admission_audit on public.ipd_admissions;
create trigger ipd_admission_audit after insert or update or delete on public.ipd_admissions
for each row execute function public.ipd_audit();

alter table public.ipd_wards enable row level security;
alter table public.ipd_beds enable row level security;
alter table public.ipd_admissions enable row level security;
alter table public.ipd_events enable row level security;
do $$ declare t text; begin
  foreach t in array array['ipd_wards','ipd_beds','ipd_admissions','ipd_events'] loop
    execute format('drop policy if exists %I on public.%I','ipd_tenant_staff_'||t,t);
    execute format('create policy %I on public.%I for all to authenticated using (hospital_id=public.current_hospital_id() and public.has_role(array[''super_admin'',''admin'',''doctor'',''receptionist'',''manager''])) with check (hospital_id=public.current_hospital_id() and public.has_role(array[''super_admin'',''admin'',''doctor'',''receptionist'',''manager'']))','ipd_tenant_staff_'||t,t);
  end loop;
end $$;
grant select,insert,update on public.ipd_wards,public.ipd_beds,public.ipd_admissions,public.ipd_events to authenticated;
grant all on public.ipd_wards,public.ipd_beds,public.ipd_admissions,public.ipd_events to service_role;

-- Staging-safe baseline capacity; tenant administrators can replace it.
insert into public.ipd_wards(hospital_id,name,ward_type)
select id,'General Ward','general' from public.hospitals where status='active'
on conflict(hospital_id,name) do nothing;
insert into public.ipd_beds(hospital_id,ward_id,bed_number,daily_rate)
select h.id,w.id,'GEN-'||n,2500
from public.hospitals h join public.ipd_wards w on w.hospital_id=h.id and w.name='General Ward'
cross join generate_series(1,5) n
on conflict(hospital_id,bed_number) do nothing;
