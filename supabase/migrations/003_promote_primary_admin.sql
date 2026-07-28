-- =============================================================================
-- Promote primary hospital admin (run once in Supabase SQL Editor)
-- Email: srisrinivasahospitals01@gmail.com
-- =============================================================================

-- 1) Ensure profile exists and is admin
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  lower(u.email),
  coalesce(u.raw_user_meta_data->>'full_name', 'Hospital Admin'),
  'admin'
from auth.users u
where lower(u.email) = 'srisrinivasahospitals01@gmail.com'
on conflict (id) do update
set
  role = 'admin',
  email = excluded.email,
  updated_at = now();

-- 2) Verify
select p.id, p.email, p.role, p.created_at
from public.profiles p
where lower(p.email) = 'srisrinivasahospitals01@gmail.com';
