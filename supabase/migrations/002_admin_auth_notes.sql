-- =============================================================================
-- Step 4 — Admin auth notes (optional helpers)
-- Profiles + is_admin() already created in 001_initial_schema.sql
-- Run only if you need a convenient way to promote an admin.
-- =============================================================================

-- Promote an existing Supabase Auth user to admin by email:
-- update public.profiles
-- set role = 'admin'
-- where email = 'admin@srisrinivasahospital.com';

-- Or by auth user id:
-- update public.profiles
-- set role = 'admin'
-- where id = '00000000-0000-0000-0000-000000000000';

-- Ensure profile exists for a user who signed up before the trigger:
-- insert into public.profiles (id, email, full_name, role)
-- select id, email, raw_user_meta_data->>'full_name', 'admin'
-- from auth.users
-- where email = 'admin@srisrinivasahospital.com'
-- on conflict (id) do update set role = 'admin', email = excluded.email;

-- Verify admin policies still include:
--   appointments: admin update / delete
--   articles / gallery: admin write
--   is_admin() security definer function
select
  proname,
  prosecdef
from pg_proc
where proname = 'is_admin';
