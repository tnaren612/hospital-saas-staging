-- Prevent anonymous PostgREST callers from bypassing the application's
-- redacted public hospital-configuration projection.

drop policy if exists hospital_settings_public_read
  on public.hospital_settings;

revoke all on table public.hospital_settings from anon;
revoke all on table public.hospital_settings from authenticated;

-- Tenant administrators retain direct database access only to their own
-- settings. Trusted server operations continue through service_role.
drop policy if exists hospital_settings_admin_write
  on public.hospital_settings;
create policy hospital_settings_admin_write
  on public.hospital_settings
  for all
  to authenticated
  using (
    public.is_admin()
    and hospital_id = public.current_hospital_id()
  )
  with check (
    public.is_admin()
    and hospital_id = public.current_hospital_id()
  );

grant select, insert, update, delete
  on table public.hospital_settings to authenticated;
grant all on table public.hospital_settings to service_role;

comment on table public.hospital_settings is
  'Protected tenant operational configuration. Anonymous clients must use /api/hospital/config, which returns an explicit public projection.';

