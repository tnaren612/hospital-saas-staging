create table if not exists public.radiology_attachments(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references public.hospitals(id) on delete cascade,
 study_id uuid not null references public.radiology_studies(id) on delete cascade,
 attachment_type text not null check(attachment_type in ('image','dicom','report','consent','other')),
 file_name text not null,file_url text not null,mime_type text not null default 'application/octet-stream',
 uploaded_by uuid references auth.users(id),created_at timestamptz not null default now()
);
alter table public.radiology_attachments enable row level security;
drop policy if exists radiology_tenant_attachments on public.radiology_attachments;
create policy radiology_tenant_attachments on public.radiology_attachments for all to authenticated
using(hospital_id=public.current_hospital_id() and public.has_role(array['super_admin','admin','doctor','radiology_technician','manager']))
with check(hospital_id=public.current_hospital_id() and public.has_role(array['super_admin','admin','doctor','radiology_technician','manager']));
grant select,insert,delete on public.radiology_attachments to authenticated;
grant all on public.radiology_attachments to service_role;
