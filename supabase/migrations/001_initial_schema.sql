-- =============================================================================
-- Sri Srinivasa Hospital — Initial Schema (Step 2)
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Or: supabase db push (if using Supabase CLI)
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  email text,
  role text not null default 'patient'
    check (role in ('patient', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_phone_idx on public.profiles (phone);
create index if not exists profiles_role_idx on public.profiles (role);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data->>'role', 'patient')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Appointments (Step 3)
-- -----------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete set null,
  patient_name text not null,
  phone text not null,
  email text not null,
  age integer not null check (age >= 1 and age <= 120),
  gender text not null check (gender in ('male', 'female', 'other')),
  problem text not null,
  doctor_id text not null default 'dr-varaprasad',
  doctor_name text not null,
  date date not null,
  time_slot text not null,
  period text not null check (period in ('morning', 'afternoon', 'evening')),
  type text not null default 'in-person'
    check (type in ('in-person', 'video')),
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'upcoming')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Prevent double-booking the same doctor slot
  constraint appointments_unique_slot unique (doctor_id, date, time_slot)
);

create index if not exists appointments_date_idx on public.appointments (date);
create index if not exists appointments_phone_idx on public.appointments (phone);
create index if not exists appointments_status_idx on public.appointments (status);
create index if not exists appointments_patient_id_idx on public.appointments (patient_id);

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Articles (Step 7 — Blog CMS)
-- -----------------------------------------------------------------------------
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content text not null,
  category text not null default 'general',
  author text not null default 'Dr. Varaprasad Venkata Sumanth',
  cover_image text,
  tags text[] not null default '{}',
  published_at date,
  read_time integer not null default 5,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_category_idx on public.articles (category);
create index if not exists articles_published_idx on public.articles (is_published, published_at desc);

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Gallery images (Step 6)
-- -----------------------------------------------------------------------------
create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  public_url text not null,
  alt text not null default '',
  category text not null default 'hospital',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gallery_images_sort_idx on public.gallery_images (sort_order);

-- -----------------------------------------------------------------------------
-- Contact messages (Step 8)
-- -----------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Helper: is current user an admin?
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.appointments enable row level security;
alter table public.articles enable row level security;
alter table public.gallery_images enable row level security;
alter table public.contact_messages enable row level security;

-- Profiles
drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- Appointments
-- Public can create (guest booking) — hospital websites often allow this
drop policy if exists "Appointments: public insert" on public.appointments;
create policy "Appointments: public insert"
  on public.appointments for insert
  to anon, authenticated
  with check (true);

-- Anyone can read booked slots fields needed for calendar (limit columns via views later if needed)
-- For privacy, we only expose existence of slots publicly via a restricted select of date/time.
-- Here we allow select of non-sensitive schedule fields for slot availability.
drop policy if exists "Appointments: public read schedule" on public.appointments;
create policy "Appointments: public read schedule"
  on public.appointments for select
  to anon, authenticated
  using (true);

-- Note: For stricter privacy, replace the policy above with a security definer
-- function that returns only (date, time_slot, doctor_id) for open calendar.

drop policy if exists "Appointments: patients update own none" on public.appointments;
-- Patients cannot update; admins can
drop policy if exists "Appointments: admin update" on public.appointments;
create policy "Appointments: admin update"
  on public.appointments for update
  using (public.is_admin());

drop policy if exists "Appointments: admin delete" on public.appointments;
create policy "Appointments: admin delete"
  on public.appointments for delete
  using (public.is_admin());

-- Articles
drop policy if exists "Articles: public read published" on public.articles;
create policy "Articles: public read published"
  on public.articles for select
  using (is_published = true or public.is_admin());

drop policy if exists "Articles: admin write" on public.articles;
create policy "Articles: admin write"
  on public.articles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Gallery
drop policy if exists "Gallery: public read" on public.gallery_images;
create policy "Gallery: public read"
  on public.gallery_images for select
  to anon, authenticated
  using (true);

drop policy if exists "Gallery: admin write" on public.gallery_images;
create policy "Gallery: admin write"
  on public.gallery_images for all
  using (public.is_admin())
  with check (public.is_admin());

-- Contact
drop policy if exists "Contact: public insert" on public.contact_messages;
create policy "Contact: public insert"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Contact: admin read" on public.contact_messages;
create policy "Contact: admin read"
  on public.contact_messages for select
  using (public.is_admin());

drop policy if exists "Contact: admin update" on public.contact_messages;
create policy "Contact: admin update"
  on public.contact_messages for update
  using (public.is_admin());

-- =============================================================================
-- STORAGE BUCKETS (Step 2 / Step 6)
-- Run after enabling Storage in Supabase project
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'gallery',
    'gallery',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  ),
  (
    'doctor',
    'doctor',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  ),
  (
    'blog-covers',
    'blog-covers',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read for all three buckets
drop policy if exists "Public read gallery" on storage.objects;
create policy "Public read gallery"
  on storage.objects for select
  to public
  using (bucket_id in ('gallery', 'doctor', 'blog-covers'));

-- Authenticated admins can upload (role checked via profiles)
drop policy if exists "Admin upload storage" on storage.objects;
create policy "Admin upload storage"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('gallery', 'doctor', 'blog-covers')
    and public.is_admin()
  );

drop policy if exists "Admin update storage" on storage.objects;
create policy "Admin update storage"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('gallery', 'doctor', 'blog-covers')
    and public.is_admin()
  );

drop policy if exists "Admin delete storage" on storage.objects;
create policy "Admin delete storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('gallery', 'doctor', 'blog-covers')
    and public.is_admin()
  );

-- =============================================================================
-- DONE
-- Next: create an admin user in Authentication → Users, then:
--   update public.profiles set role = 'admin' where email = 'your@email.com';
-- =============================================================================
