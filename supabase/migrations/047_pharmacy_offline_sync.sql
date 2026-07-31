-- ---------------------------------------------------------------------------
-- 047: Pharmacy offline sync ledger
--
-- Idempotent replay ledger for the offline-first pharmacy queue:
-- every queued mutation applied via /api/admin/pharmacy/sync records its op_id
-- here so a retried push can never double-apply a sale / return / shift.
-- Mirrors the 046 pharmacy tenant policy pattern (is_hospital_staff +
-- current_hospital_id) for reads; service role owns the writes.
-- ---------------------------------------------------------------------------

create table if not exists public.pharmacy_sync_ledger (
  op_id text primary key,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  entity text not null,
  action text not null,
  status text not null check (status in ('applied', 'failed', 'conflict')),
  response jsonb,
  error text,
  applied_at timestamptz not null default now()
);

create index if not exists pharmacy_sync_ledger_hospital_idx
  on public.pharmacy_sync_ledger (hospital_id, applied_at desc);

create index if not exists pharmacy_sync_ledger_entity_idx
  on public.pharmacy_sync_ledger (entity, applied_at desc);

alter table public.pharmacy_sync_ledger enable row level security;

drop policy if exists pharmacy_sync_ledger_staff on public.pharmacy_sync_ledger;
create policy pharmacy_sync_ledger_staff
  on public.pharmacy_sync_ledger
  for select to authenticated
  using (
    public.is_hospital_staff()
    and (hospital_id is null or hospital_id = public.current_hospital_id())
  );

grant select on public.pharmacy_sync_ledger to authenticated;
grant select, insert, update, delete on public.pharmacy_sync_ledger to service_role;
