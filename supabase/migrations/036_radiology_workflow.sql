create table if not exists public.radiology_studies (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  study_number text not null,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  ordered_by uuid references auth.users(id) on delete set null,
  modality text not null check (modality in ('xray','ct','mri','ultrasound','mammography','fluoroscopy','other')),
  body_part text not null,
  clinical_indication text not null,
  priority text not null default 'routine' check (priority in ('routine','urgent','stat')),
  status text not null default 'ordered'
    check (status in ('ordered','scheduled','checked_in','in_progress','completed','reported','cancelled')),
  scheduled_at timestamptz,
  accession_number text,
  technician_id uuid references auth.users(id) on delete set null,
  radiologist_id uuid references auth.users(id) on delete set null,
  findings text,
  impression text,
  recommendations text,
  report_url text,
  reported_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id,study_number),
  unique(hospital_id,accession_number)
);

create table if not exists public.radiology_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  study_id uuid not null references public.radiology_studies(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists radiology_studies_tenant_schedule_idx
  on public.radiology_studies(hospital_id,status,scheduled_at);
create index if not exists radiology_studies_patient_idx
  on public.radiology_studies(hospital_id,patient_id,created_at desc);
create index if not exists radiology_events_study_idx
  on public.radiology_events(hospital_id,study_id,created_at);

create or replace function public.radiology_before_write() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' and nullif(new.study_number,'') is null then
    new.study_number := 'RAD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  if new.status in ('scheduled','checked_in','in_progress','completed','reported')
     and new.scheduled_at is null then
    raise exception 'scheduled_at is required for the selected status';
  end if;
  if new.status='reported' and (nullif(trim(new.findings),'') is null or nullif(trim(new.impression),'') is null) then
    raise exception 'findings and impression are required before reporting';
  end if;
  if new.status='reported' and new.reported_at is null then new.reported_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists radiology_before_write on public.radiology_studies;
create trigger radiology_before_write before insert or update on public.radiology_studies
for each row execute function public.radiology_before_write();

create or replace function public.radiology_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.radiology_events(hospital_id,study_id,actor_id,event_type,details)
  values(coalesce(new.hospital_id,old.hospital_id),coalesce(new.id,old.id),auth.uid(),
    lower(tg_op),jsonb_build_object(
      'old',case when tg_op<>'INSERT' then to_jsonb(old) end,
      'new',case when tg_op<>'DELETE' then to_jsonb(new) end));
  return coalesce(new,old);
end $$;
drop trigger if exists radiology_study_audit on public.radiology_studies;
create trigger radiology_study_audit after insert or update or delete on public.radiology_studies
for each row execute function public.radiology_audit();

alter table public.radiology_studies enable row level security;
alter table public.radiology_events enable row level security;
drop policy if exists radiology_tenant_staff_studies on public.radiology_studies;
create policy radiology_tenant_staff_studies on public.radiology_studies for all to authenticated
using (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','radiology_technician','receptionist','manager'])
)
with check (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','radiology_technician','receptionist','manager'])
);
drop policy if exists radiology_tenant_staff_events on public.radiology_events;
create policy radiology_tenant_staff_events on public.radiology_events for select to authenticated
using (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','radiology_technician','manager'])
);

grant select,insert,update on public.radiology_studies to authenticated;
grant select on public.radiology_events to authenticated;
grant all on public.radiology_studies,public.radiology_events to service_role;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  lower(role) in (
    'super_admin','admin','doctor','patient','receptionist','lab_technician',
    'radiology_technician','pharmacist','billing','finance','hr','manager'
  )
);
