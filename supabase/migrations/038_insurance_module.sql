-- ============================================================================
-- Insurance Module — Providers, Policies, Pre-authorizations, Claims
-- Additive migration (never modify previous migrations).
-- Tenant isolation via hospital_id + RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Insurance Providers (master list of insurers)
-- ---------------------------------------------------------------------------
create table if not exists public.insurance_providers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  provider_name text not null,
  provider_code text not null,
  provider_type text not null
    check (provider_type in ('government','private','corporate','tpa')),
  contact_person text,
  contact_email text,
  contact_phone text,
  address text,
  registration_number text,
  is_active boolean not null default true,
  coverage_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id, provider_code)
);

-- ---------------------------------------------------------------------------
-- 2. Patient Insurance (policies assigned to patients)
-- ---------------------------------------------------------------------------
create table if not exists public.patient_insurance (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  provider_id uuid not null references public.insurance_providers(id) on delete restrict,
  policy_number text not null,
  group_number text,
  insured_name text not null,
  insured_relationship text not null
    check (insured_relationship in ('self','spouse','child','parent','other')),
  coverage_from date not null,
  coverage_to date not null,
  coverage_type text not null
    check (coverage_type in ('individual','family','group','senior_citizen','maternity','critical_illness')),
  sum_insured numeric(12,2),
  copay_percent numeric(5,2) not null default 0,
  deductible_amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','expired','cancelled')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id, policy_number)
);

-- ---------------------------------------------------------------------------
-- 3. Pre-Authorizations
-- ---------------------------------------------------------------------------
create table if not exists public.pre_authorizations (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  patient_insurance_id uuid not null references public.patient_insurance(id) on delete restrict,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  authorization_number text,
  treatment_type text not null,
  diagnosis_code text,
  procedure_code text,
  estimated_amount numeric(12,2) not null,
  approved_amount numeric(12,2),
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','partially_approved','rejected','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  clinical_notes text,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id, authorization_number)
);

-- ---------------------------------------------------------------------------
-- 4. Insurance Claims
-- ---------------------------------------------------------------------------
create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  claim_number text not null,
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  patient_insurance_id uuid not null references public.patient_insurance(id) on delete restrict,
  pre_authorization_id uuid references public.pre_authorizations(id) on delete set null,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  total_bill_amount numeric(12,2) not null,
  claim_amount numeric(12,2) not null,
  approved_amount numeric(12,2),
  deductible_amount numeric(12,2) not null default 0,
  copay_amount numeric(12,2) not null default 0,
  settlement_amount numeric(12,2),
  status text not null default 'draft'
    check (status in ('draft','submitted','in_process','approved','partially_approved','rejected','settled','cancelled')),
  submitted_date timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  processed_date timestamptz,
  settlement_date timestamptz,
  settlement_ref text,
  rejection_reason text,
  notes text,
  diagnosis_codes text,
  procedure_codes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hospital_id, claim_number)
);

-- ---------------------------------------------------------------------------
-- 5. Claim Documents
-- ---------------------------------------------------------------------------
create table if not exists public.claim_documents (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  claim_id uuid not null references public.insurance_claims(id) on delete cascade,
  document_type text not null
    check (document_type in ('prescription','discharge_summary','investigation_report','invoice','id_proof','policy_copy','other')),
  file_name text not null,
  file_url text not null,
  file_size integer,
  uploaded_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Claim Status History (immutable audit trail)
-- ---------------------------------------------------------------------------
create table if not exists public.claim_status_history (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  claim_id uuid not null references public.insurance_claims(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  change_reason text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists insurance_providers_tenant_active_idx
  on public.insurance_providers(hospital_id, is_active);
create index if not exists patient_insurance_tenant_patient_idx
  on public.patient_insurance(hospital_id, patient_id, is_active);
create index if not exists patient_insurance_tenant_provider_idx
  on public.patient_insurance(hospital_id, provider_id);
create index if not exists pre_authorizations_tenant_patient_idx
  on public.pre_authorizations(hospital_id, patient_id, status);
create index if not exists pre_authorizations_tenant_status_idx
  on public.pre_authorizations(hospital_id, status, created_at desc);
create index if not exists insurance_claims_tenant_patient_idx
  on public.insurance_claims(hospital_id, patient_id, status);
create index if not exists insurance_claims_tenant_status_idx
  on public.insurance_claims(hospital_id, status, created_at desc);
create index if not exists insurance_claims_tenant_provider_idx
  on public.insurance_claims(hospital_id, patient_insurance_id);
create index if not exists claim_documents_claim_idx
  on public.claim_documents(hospital_id, claim_id);
create index if not exists claim_status_history_claim_idx
  on public.claim_status_history(hospital_id, claim_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Before-write trigger: insurance_providers
-- ---------------------------------------------------------------------------
create or replace function public.insurance_providers_before_write() returns trigger
language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists insurance_providers_before_write on public.insurance_providers;
create trigger insurance_providers_before_write before insert or update on public.insurance_providers
for each row execute function public.insurance_providers_before_write();

-- ---------------------------------------------------------------------------
-- Before-write trigger: patient_insurance
-- ---------------------------------------------------------------------------
create or replace function public.patient_insurance_before_write() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.coverage_to < new.coverage_from then
    raise exception 'coverage_to must be after coverage_from';
  end if;
  if new.verification_status = 'verified' and new.verified_at is null then
    new.verified_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists patient_insurance_before_write on public.patient_insurance;
create trigger patient_insurance_before_write before insert or update on public.patient_insurance
for each row execute function public.patient_insurance_before_write();

-- ---------------------------------------------------------------------------
-- Before-write trigger: pre_authorizations
-- ---------------------------------------------------------------------------
create or replace function public.pre_authorizations_before_write() returns trigger
language plpgsql set search_path=public as $$
begin
  if nullif(new.authorization_number,'') is null and new.status in ('submitted','approved','partially_approved') then
    new.authorization_number := 'PA-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  if new.status in ('approved','partially_approved') and new.approved_at is null then
    new.approved_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pre_authorizations_before_write on public.pre_authorizations;
create trigger pre_authorizations_before_write before insert or update on public.pre_authorizations
for each row execute function public.pre_authorizations_before_write();

-- ---------------------------------------------------------------------------
-- Before-write trigger: insurance_claims
-- ---------------------------------------------------------------------------
create or replace function public.insurance_claims_before_write() returns trigger
language plpgsql set search_path=public as $$
begin
  if nullif(new.claim_number,'') is null and tg_op='INSERT' then
    new.claim_number := 'CLM-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  if new.status = 'settled' and new.settlement_date is null then
    new.settlement_date := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists insurance_claims_before_write on public.insurance_claims;
create trigger insurance_claims_before_write before insert or update on public.insurance_claims
for each row execute function public.insurance_claims_before_write();

-- ---------------------------------------------------------------------------
-- Claim status history trigger (automatically log status changes)
-- ---------------------------------------------------------------------------
create or replace function public.insurance_claims_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and (old.status is distinct from new.status) then
    insert into public.claim_status_history(
      hospital_id, claim_id, from_status, to_status, changed_by, change_reason, notes
    ) values (
      new.hospital_id, new.id, old.status, new.status, auth.uid(),
      case
        when new.status='submitted' then 'Claim submitted'
        when new.status='in_process' then 'Claim is being processed'
        when new.status='approved' then 'Claim approved'
        when new.status='partially_approved' then 'Claim partially approved'
        when new.status='rejected' then coalesce(new.rejection_reason, 'Claim rejected')
        when new.status='settled' then 'Claim settled'
        when new.status='cancelled' then 'Claim cancelled'
        else 'Status changed'
      end,
      new.notes
    );
  end if;
  return new;
end $$;
drop trigger if exists insurance_claims_status_audit on public.insurance_claims;
create trigger insurance_claims_status_audit after update on public.insurance_claims
for each row when (old.status is distinct from new.status)
execute function public.insurance_claims_audit();

-- Also log on insert (initial status)
create or replace function public.insurance_claims_insert_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.claim_status_history(
    hospital_id, claim_id, from_status, to_status, changed_by, change_reason, notes
  ) values (
    new.hospital_id, new.id, null, new.status, auth.uid(),
    'Claim created', new.notes
  );
  return new;
end $$;
drop trigger if exists insurance_claims_insert_audit on public.insurance_claims;
create trigger insurance_claims_insert_audit after insert on public.insurance_claims
for each row execute function public.insurance_claims_insert_audit();

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

-- insurance_providers
alter table public.insurance_providers enable row level security;
drop policy if exists insurance_providers_tenant_staff on public.insurance_providers;
create policy insurance_providers_tenant_staff on public.insurance_providers for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager','receptionist'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
);

-- patient_insurance
alter table public.patient_insurance enable row level security;
drop policy if exists patient_insurance_tenant_staff on public.patient_insurance;
create policy patient_insurance_tenant_staff on public.patient_insurance for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager','receptionist','doctor'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager','receptionist'])
);

-- pre_authorizations
alter table public.pre_authorizations enable row level security;
drop policy if exists pre_authorizations_tenant_staff on public.pre_authorizations;
create policy pre_authorizations_tenant_staff on public.pre_authorizations for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager','doctor'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager','doctor'])
);

-- insurance_claims
alter table public.insurance_claims enable row level security;
drop policy if exists insurance_claims_tenant_staff on public.insurance_claims;
create policy insurance_claims_tenant_staff on public.insurance_claims for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
);

-- claim_documents
alter table public.claim_documents enable row level security;
drop policy if exists claim_documents_tenant_staff on public.claim_documents;
create policy claim_documents_tenant_staff on public.claim_documents for all to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
)
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
);

-- claim_status_history (read-only for staff, insert-only via trigger)
alter table public.claim_status_history enable row level security;
drop policy if exists claim_status_history_tenant_staff_select on public.claim_status_history;
create policy claim_status_history_tenant_staff_select on public.claim_status_history for select to authenticated
using (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
);
drop policy if exists claim_status_history_tenant_staff_insert on public.claim_status_history;
create policy claim_status_history_tenant_staff_insert on public.claim_status_history for insert to authenticated
with check (
  hospital_id = public.current_hospital_id()
  and public.has_role(array['super_admin','admin','billing','finance','manager'])
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update on public.insurance_providers to authenticated;
grant select, insert, update on public.patient_insurance to authenticated;
grant select, insert, update on public.pre_authorizations to authenticated;
grant select, insert, update on public.insurance_claims to authenticated;
grant select, insert, update on public.claim_documents to authenticated;
grant select, insert on public.claim_status_history to authenticated;
grant all on public.insurance_providers, public.patient_insurance, public.pre_authorizations,
  public.insurance_claims, public.claim_documents, public.claim_status_history to service_role;
