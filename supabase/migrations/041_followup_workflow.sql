alter table public.patient_followups
  add column if not exists status text not null default 'scheduled'
    check(status in ('scheduled','confirmed','completed','missed','cancelled')),
  add column if not exists recurrence text not null default 'none'
    check(recurrence in ('none','weekly','fortnightly','monthly','quarterly')),
  add column if not exists recurrence_end date,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_status text not null default 'pending'
    check(reminder_status in ('pending','sent','failed','not_required')),
  add column if not exists visit_notes text not null default '',
  add column if not exists clinical_review text not null default '',
  add column if not exists outcome text not null default '',
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.followup_events(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references public.hospitals(id) on delete cascade,
 followup_id uuid not null references public.patient_followups(id) on delete cascade,
 actor_id uuid references auth.users(id),
 event_type text not null,
 from_status text,
 to_status text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create or replace function public.followup_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.followup_events(hospital_id,followup_id,actor_id,event_type,from_status,to_status,details)
 values(new.hospital_id,new.id,auth.uid(),case when tg_op='INSERT' then 'created' else 'updated' end,
 case when tg_op='UPDATE' then old.status end,new.status,
 jsonb_build_object('purpose',new.purpose,'outcome',new.outcome));
 return new;
end $$;
drop trigger if exists followup_audit_trigger on public.patient_followups;
create trigger followup_audit_trigger after insert or update on public.patient_followups
for each row execute function public.followup_audit();

alter table public.followup_events enable row level security;
drop policy if exists followup_tenant_events on public.followup_events;
create policy followup_tenant_events on public.followup_events for select to authenticated
using(hospital_id=public.current_hospital_id() and public.has_role(array['super_admin','admin','doctor','receptionist','manager']));
grant select on public.followup_events to authenticated;
grant all on public.followup_events to service_role;

