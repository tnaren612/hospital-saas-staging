create table if not exists public.discharge_cases (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_number text not null,
  admission_id uuid not null references public.ipd_admissions(id) on delete restrict,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  status text not null default 'draft'
    check(status in ('draft','clearance_pending','ready','discharged','cancelled')),
  discharge_type text not null default 'routine'
    check(discharge_type in ('routine','against_medical_advice','transfer','death','absconded')),
  primary_diagnosis text not null,
  secondary_diagnoses jsonb not null default '[]'::jsonb,
  procedures_performed text not null default '',
  hospital_course text not null default '',
  condition_at_discharge text not null default '',
  discharge_summary text not null default '',
  medication_instructions text not null default '',
  diet_instructions text not null default '',
  activity_instructions text not null default '',
  warning_signs text not null default '',
  emergency_instructions text not null default '',
  transport_required boolean not null default false,
  prepared_by uuid references auth.users(id) on delete set null,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id,discharge_number),
  unique(hospital_id,admission_id)
);

create table if not exists public.discharge_clearances (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_id uuid not null references public.discharge_cases(id) on delete cascade,
  clearance_type text not null
    check(clearance_type in ('clinical','radiology','pharmacy','billing','insurance','inventory')),
  status text not null default 'pending' check(status in ('pending','approved','blocked','waived')),
  notes text not null default '',
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  unique(discharge_id,clearance_type)
);

create table if not exists public.discharge_medications (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_id uuid not null references public.discharge_cases(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  medication_name text not null,
  dosage text not null default '',
  frequency text not null default '',
  duration text not null default '',
  instructions text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.patient_referrals (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_id uuid references public.discharge_cases(id) on delete cascade,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  referred_to text not null,
  specialty text not null default '',
  facility_name text not null default '',
  reason text not null,
  urgency text not null default 'routine' check(urgency in ('routine','urgent','emergency')),
  appointment_date timestamptz,
  status text not null default 'pending' check(status in ('pending','scheduled','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_followups (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_id uuid references public.discharge_cases(id) on delete cascade,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  follow_up_at timestamptz not null,
  department text not null default '',
  clinician_id uuid references auth.users(id) on delete set null,
  purpose text not null,
  instructions text not null default '',
  status text not null default 'scheduled' check(status in ('scheduled','completed','missed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.discharge_documents (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_id uuid not null references public.discharge_cases(id) on delete cascade,
  document_type text not null check(document_type in ('summary','medication','referral','follow_up','insurance','other')),
  file_name text not null, file_url text not null, uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.discharge_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  discharge_id uuid not null references public.discharge_cases(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists discharge_cases_tenant_status_idx on public.discharge_cases(hospital_id,status,created_at desc);
create index if not exists discharge_clearances_case_idx on public.discharge_clearances(hospital_id,discharge_id);
create index if not exists patient_referrals_tenant_patient_idx on public.patient_referrals(hospital_id,patient_id,created_at desc);
create index if not exists patient_followups_tenant_patient_idx on public.patient_followups(hospital_id,patient_id,follow_up_at);

create or replace function public.discharge_before_write() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' and nullif(new.discharge_number,'') is null then
    new.discharge_number := 'DIS-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  new.updated_at:=now(); return new;
end $$;
drop trigger if exists discharge_before_write on public.discharge_cases;
create trigger discharge_before_write before insert or update on public.discharge_cases for each row execute function public.discharge_before_write();

create or replace function public.discharge_seed_clearances() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.discharge_clearances(hospital_id,discharge_id,clearance_type)
  select new.hospital_id,new.id,t from unnest(array['clinical','radiology','pharmacy','billing','insurance','inventory']) t;
  return new;
end $$;
drop trigger if exists discharge_seed_clearances on public.discharge_cases;
create trigger discharge_seed_clearances after insert on public.discharge_cases for each row execute function public.discharge_seed_clearances();

create or replace function public.discharge_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.discharge_events(hospital_id,discharge_id,actor_id,event_type,details)
  values(coalesce(new.hospital_id,old.hospital_id),coalesce(new.id,old.id),auth.uid(),lower(tg_op),
    jsonb_build_object('old',case when tg_op<>'INSERT' then to_jsonb(old) end,'new',case when tg_op<>'DELETE' then to_jsonb(new) end));
  return coalesce(new,old);
end $$;
drop trigger if exists discharge_case_audit on public.discharge_cases;
create trigger discharge_case_audit after insert or update or delete on public.discharge_cases for each row execute function public.discharge_audit();

create or replace function public.finalize_enterprise_discharge(p_discharge_id uuid) returns public.discharge_cases
language plpgsql security invoker set search_path=public as $$
declare d public.discharge_cases; admission public.ipd_admissions; result public.discharge_cases;
begin
  select * into d from public.discharge_cases where id=p_discharge_id and hospital_id=public.current_hospital_id() for update;
  if d.id is null then raise exception 'Discharge case not found'; end if;
  if exists(select 1 from public.discharge_clearances where discharge_id=d.id and status not in ('approved','waived')) then
    raise exception 'All discharge clearances must be approved or waived';
  end if;
  if nullif(trim(d.discharge_summary),'') is null or nullif(trim(d.condition_at_discharge),'') is null then
    raise exception 'Summary and condition at discharge are required';
  end if;
  select * into admission from public.ipd_admissions where id=d.admission_id and hospital_id=d.hospital_id for update;
  update public.ipd_admissions set status='discharged',discharged_at=now(),discharge_summary=d.discharge_summary,
    discharge_instructions=concat_ws(E'\n',d.medication_instructions,d.diet_instructions,d.activity_instructions,d.warning_signs,d.emergency_instructions),
    follow_up_date=(select min(follow_up_at)::date from public.patient_followups where discharge_id=d.id and status='scheduled')
    where id=d.admission_id;
  update public.ipd_beds set status='cleaning' where id=admission.bed_id and hospital_id=d.hospital_id;
  if d.encounter_id is not null then
    update public.clinical_encounters set status='completed',completed_at=coalesce(completed_at,now()),completed_by=coalesce(completed_by,auth.uid())
    where id=d.encounter_id and hospital_id=d.hospital_id and status in ('draft','in_progress');
  end if;
  update public.discharge_cases set status='discharged',finalized_by=auth.uid(),finalized_at=now() where id=d.id returning * into result;
  return result;
end $$;

do $$ declare t text; begin
  foreach t in array array['discharge_cases','discharge_clearances','discharge_medications','patient_referrals','patient_followups','discharge_documents','discharge_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists discharge_tenant_%I on public.%I',t,t);
    execute format('create policy discharge_tenant_%I on public.%I for all to authenticated using (hospital_id=public.current_hospital_id() and public.has_role(array[''super_admin'',''admin'',''doctor'',''receptionist'',''billing'',''pharmacist'',''manager''])) with check (hospital_id=public.current_hospital_id() and public.has_role(array[''super_admin'',''admin'',''doctor'',''receptionist'',''billing'',''pharmacist'',''manager'']))',t,t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant execute on function public.finalize_enterprise_discharge(uuid) to authenticated,service_role;
