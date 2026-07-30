-- Align encounters with the operational HMS patient record and related orders.
alter table public.clinical_encounters
  drop constraint if exists clinical_encounters_patient_id_fkey;
alter table public.clinical_encounters
  add constraint clinical_encounters_patient_id_fkey
  foreign key (patient_id) references public.hospital_patients(id) on delete restrict;

alter table public.clinical_encounters
  add column if not exists orders jsonb not null default '[]'::jsonb;
alter table public.clinical_encounters
  add column if not exists prescription_id uuid
  references public.prescriptions(id) on delete set null;

create index if not exists encounters_prescription_idx
  on public.clinical_encounters(hospital_id, prescription_id)
  where prescription_id is not null;
