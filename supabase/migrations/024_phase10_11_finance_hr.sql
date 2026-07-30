-- =============================================================================
-- Phase 10–11 — Finance expenses + HR employees / leave / attendance
-- Idempotent
-- =============================================================================

create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general',
  description text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  payment_method text not null default 'cash',
  vendor text,
  reference_no text,
  recorded_by uuid references auth.users (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_expenses_date_idx
  on public.finance_expenses (expense_date desc);
create index if not exists finance_expenses_category_idx
  on public.finance_expenses (category);

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique,
  full_name text not null,
  email text,
  phone text,
  role_title text not null default 'Staff',
  department text not null default 'General',
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'intern')),
  join_date date,
  salary_monthly numeric(14,2) not null default 0 check (salary_monthly >= 0),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'terminated')),
  user_id uuid references auth.users (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_employees_status_idx on public.hr_employees (status);
create index if not exists hr_employees_name_idx on public.hr_employees (full_name);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  leave_type text not null default 'casual'
    check (leave_type in ('casual', 'sick', 'earned', 'unpaid', 'other')),
  from_date date not null,
  to_date date not null,
  days numeric(6,1) not null default 1 check (days > 0),
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_leave_date_order check (from_date <= to_date)
);

create index if not exists hr_leave_employee_idx on public.hr_leave_requests (employee_id);
create index if not exists hr_leave_status_idx on public.hr_leave_requests (status);

create table if not exists public.hr_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  work_date date not null,
  status text not null default 'present'
    check (status in ('present', 'absent', 'half_day', 'leave', 'holiday')),
  check_in time,
  check_out time,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists hr_attendance_date_idx on public.hr_attendance (work_date desc);

alter table public.finance_expenses enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_attendance enable row level security;

drop policy if exists finance_expenses_staff on public.finance_expenses;
create policy finance_expenses_staff on public.finance_expenses
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists hr_employees_staff on public.hr_employees;
create policy hr_employees_staff on public.hr_employees
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists hr_leave_staff on public.hr_leave_requests;
create policy hr_leave_staff on public.hr_leave_requests
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists hr_attendance_staff on public.hr_attendance;
create policy hr_attendance_staff on public.hr_attendance
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

grant all on public.finance_expenses to authenticated, service_role;
grant all on public.hr_employees to authenticated, service_role;
grant all on public.hr_leave_requests to authenticated, service_role;
grant all on public.hr_attendance to authenticated, service_role;
