alter table public.patient_referrals
  add column if not exists referral_type text not null default 'external'
    check (referral_type in ('internal','external')),
  add column if not exists referred_department_id uuid references public.departments(id),
  add column if not exists referred_clinician_id uuid references auth.users(id),
  add column if not exists status text not null default 'draft'
    check (status in ('draft','sent','accepted','scheduled','completed','declined','cancelled')),
  add column if not exists clinical_notes text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.referral_attachments (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  referral_id uuid not null references public.patient_referrals(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text not null default 'application/octet-stream',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  referral_id uuid not null references public.patient_referrals(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  from_status text,
  to_status text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.referral_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.referral_events(
    hospital_id,referral_id,actor_id,event_type,from_status,to_status,notes
  ) values (
    new.hospital_id,new.id,auth.uid(),
    case when tg_op='INSERT' then 'created' else 'updated' end,
    case when tg_op='UPDATE' then old.status end,new.status,new.clinical_notes
  );
  return new;
end $$;

drop trigger if exists referral_audit_trigger on public.patient_referrals;
create trigger referral_audit_trigger after insert or update on public.patient_referrals
for each row execute function public.referral_audit();

alter table public.referral_attachments enable row level security;
alter table public.referral_events enable row level security;

drop policy if exists referral_tenant_attachments on public.referral_attachments;
create policy referral_tenant_attachments on public.referral_attachments for all to authenticated
using (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','receptionist','manager'])
)
with check (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','receptionist','manager'])
);

drop policy if exists referral_tenant_events on public.referral_events;
create policy referral_tenant_events on public.referral_events for select to authenticated
using (
  hospital_id=public.current_hospital_id()
  and public.has_role(array['super_admin','admin','doctor','receptionist','manager'])
);

grant select,insert,update on public.referral_attachments to authenticated;
grant select on public.referral_events to authenticated;
grant all on public.referral_attachments,public.referral_events to service_role;

