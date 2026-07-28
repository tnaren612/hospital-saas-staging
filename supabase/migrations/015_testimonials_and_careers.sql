-- =============================================================================
-- Testimonials CMS + Careers applications
-- =============================================================================

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default '',
  treatment text not null default '',
  content text not null,
  rating int not null default 5 check (rating >= 1 and rating <= 5),
  image_url text not null default '',
  review_date date not null default current_date,
  featured boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists testimonials_published_idx
  on public.testimonials (published, featured, sort_order, review_date desc);

drop trigger if exists testimonials_set_updated_at on public.testimonials;
create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute function public.set_updated_at();

alter table public.testimonials enable row level security;

drop policy if exists "Testimonials: public read published" on public.testimonials;
create policy "Testimonials: public read published"
  on public.testimonials for select
  to anon, authenticated
  using (published = true or public.is_admin());

drop policy if exists "Testimonials: admin write" on public.testimonials;
create policy "Testimonials: admin write"
  on public.testimonials for all
  using (public.is_admin())
  with check (public.is_admin());

-- Careers applications
create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  job_title text not null default '',
  full_name text not null,
  email text not null,
  phone text not null,
  experience_years numeric,
  cover_note text not null default '',
  resume_url text not null default '',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists career_applications_created_idx
  on public.career_applications (created_at desc);

alter table public.career_applications enable row level security;

drop policy if exists "Careers: public insert" on public.career_applications;
create policy "Careers: public insert"
  on public.career_applications for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Careers: admin read" on public.career_applications;
create policy "Careers: admin read"
  on public.career_applications for select
  using (public.is_admin());

-- FAQ CMS (optional override of static JSON)
create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'general',
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_items_published_idx
  on public.faq_items (is_published, sort_order);

alter table public.faq_items enable row level security;

drop policy if exists "FAQ: public read" on public.faq_items;
create policy "FAQ: public read"
  on public.faq_items for select
  to anon, authenticated
  using (is_published = true or public.is_admin());

drop policy if exists "FAQ: admin write" on public.faq_items;
create policy "FAQ: admin write"
  on public.faq_items for all
  using (public.is_admin())
  with check (public.is_admin());
