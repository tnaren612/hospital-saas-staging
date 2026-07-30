-- Tenant-isolated clinical encounter lifecycle and immutable audit trail.
create table if not exists public.clinical_encounters (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  encounter_number text not null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  clinician_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','in_progress','completed','amended','cancelled')),
  encounter_type text not null default 'outpatient'
    check (encounter_type in ('outpatient','emergency','telemedicine','follow_up')),
  chief_complaint text not null,
  history text not null default '',
  examination text not null default '',
  assessment text not null default '',
  plan text not null default '',
  diagnoses jsonb not null default '[]'::jsonb,
  observations jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, encounter_number)
);

create index if not exists encounters_tenant_patient_idx
  on public.clinical_encounters(hospital_id, patient_id, created_at desc);
create index if not exists encounters_tenant_clinician_idx
  on public.clinical_encounters(hospital_id, clinician_user_id, created_at desc);

create table if not exists public.clinical_audit_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists clinical_audit_tenant_encounter_idx
  on public.clinical_audit_events(hospital_id, encounter_id, created_at desc);

create or replace function public.set_encounter_number()
returns trigger language plpgsql set search_path=public as $$
begin
  if nullif(new.encounter_number, '') is null then
    new.encounter_number := 'ENC-' || to_char(now(),'YYYYMMDD') || '-' ||
      upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  return new;
end $$;
drop trigger if exists clinical_encounter_number on public.clinical_encounters;
create trigger clinical_encounter_number before insert on public.clinical_encounters
for each row execute function public.set_encounter_number();

create or replace function public.audit_clinical_encounter()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.clinical_audit_events(
    hospital_id, encounter_id, actor_id, action, previous_data, new_data
  ) values (
    coalesce(new.hospital_id, old.hospital_id),
    coalesce(new.id, old.id),
    auth.uid(),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;
drop trigger if exists clinical_encounter_audit on public.clinical_encounters;
create trigger clinical_encounter_audit after insert or update or delete
on public.clinical_encounters for each row execute function public.audit_clinical_encounter();

alter table public.clinical_encounters enable row level security;
alter table public.clinical_audit_events enable row level security;

drop policy if exists encounters_tenant_staff on public.clinical_encounters;
create policy encounters_tenant_staff on public.clinical_encounters
for select to authenticated using (
  hospital_id=public.current_hospital_id() and public.is_staff()
);
drop policy if exists encounters_tenant_clinical_write on public.clinical_encounters;
create policy encounters_tenant_clinical_write on public.clinical_encounters
for all to authenticated
using (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor'])
)
with check (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor'])
);
drop policy if exists clinical_audit_tenant_read on public.clinical_audit_events;
create policy clinical_audit_tenant_read on public.clinical_audit_events
for select to authenticated using (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','manager'])
);

grant select,insert,update on public.clinical_encounters to authenticated;
grant select on public.clinical_audit_events to authenticated;
grant all on public.clinical_encounters, public.clinical_audit_events to service_role;
