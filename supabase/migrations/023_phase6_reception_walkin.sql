-- =============================================================================
-- Phase 6 — Reception: walk-in flag on appointments
-- =============================================================================

alter table public.appointments
  add column if not exists is_walk_in boolean not null default false;

create index if not exists appointments_walk_in_day_idx
  on public.appointments (date, is_walk_in)
  where is_walk_in = true;

comment on column public.appointments.is_walk_in is
  'True when registered at reception as walk-in (same-day)';
