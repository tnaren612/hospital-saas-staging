-- =============================================================================
-- Phase 2 — Doctors module enhancements (extends hospital_doctors)
-- Idempotent. Does NOT replace existing HMS tables.
-- Gallery photos continue via gallery_images (section=doctor, key=profile|gallery)
-- Leave management remains on doctor_availability (existing).
-- =============================================================================

-- Public URL slug
alter table public.hospital_doctors
  add column if not exists slug text;

-- Rich profile fields (arrays / text)
alter table public.hospital_doctors
  add column if not exists degrees text[] not null default '{}';

alter table public.hospital_doctors
  add column if not exists certifications text[] not null default '{}';

alter table public.hospital_doctors
  add column if not exists awards text[] not null default '{}';

alter table public.hospital_doctors
  add column if not exists memberships text[] not null default '{}';

alter table public.hospital_doctors
  add column if not exists languages text[] not null default array['English','Telugu'];

alter table public.hospital_doctors
  add column if not exists treatments text[] not null default '{}';

alter table public.hospital_doctors
  add column if not exists services text[] not null default '{}';

alter table public.hospital_doctors
  add column if not exists experience_timeline text[] not null default '{}';

-- Structured FAQ: [{ "question": "...", "answer": "..." }]
alter table public.hospital_doctors
  add column if not exists faqs jsonb not null default '[]'::jsonb;

-- Optional media
alter table public.hospital_doctors
  add column if not exists video_intro_url text;

-- Display / listing
alter table public.hospital_doctors
  add column if not exists is_featured boolean not null default false;

alter table public.hospital_doctors
  add column if not exists consultation_timings text not null default '';

alter table public.hospital_doctors
  add column if not exists video_consultation_fee numeric(12,2);

-- SEO
alter table public.hospital_doctors
  add column if not exists seo_title text;

alter table public.hospital_doctors
  add column if not exists seo_description text;

-- Unique slug when present
create unique index if not exists hospital_doctors_slug_uidx
  on public.hospital_doctors (slug)
  where slug is not null and slug <> '';

create index if not exists hospital_doctors_featured_idx
  on public.hospital_doctors (is_featured, status)
  where status = 'active';

create index if not exists hospital_doctors_specializations_gin
  on public.hospital_doctors using gin (specializations);

-- Backfill slugs from name for existing rows
update public.hospital_doctors
set slug = trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
where (slug is null or slug = '')
  and name is not null;

-- Ensure uniqueness if collisions (append short id suffix)
update public.hospital_doctors d
set slug = d.slug || '-' || substr(replace(d.id::text, '-', ''), 1, 6)
where d.slug is not null
  and exists (
    select 1 from public.hospital_doctors o
    where o.slug = d.slug and o.id <> d.id
  );

-- Seed primary doctor profile content if still thin
update public.hospital_doctors
set
  degrees = case when coalesce(array_length(degrees, 1), 0) = 0
    then array['MBBS', 'DNB', 'FSM', 'CCEBDM'] else degrees end,
  certifications = case when coalesce(array_length(certifications, 1), 0) = 0
    then array[
      'MBBS — Medical Degree',
      'DNB — Diplomate of National Board',
      'FSM — Fellowship in Sleep Medicine',
      'CCEBDM — Certificate Course in Evidence Based Diabetes Management'
    ] else certifications end,
  awards = case when coalesce(array_length(awards, 1), 0) = 0
    then array[
      'Excellence in Pulmonology Practice',
      'Community Healthcare Leadership Award',
      'Best Clinical Educator Recognition'
    ] else awards end,
  languages = case when coalesce(array_length(languages, 1), 0) = 0
    then array['English', 'Telugu', 'Hindi'] else languages end,
  treatments = case when coalesce(array_length(treatments, 1), 0) = 0
    then array[
      'Asthma management',
      'COPD care',
      'Sleep apnea evaluation',
      'Respiratory infections',
      'Critical care / ICU support'
    ] else treatments end,
  services = case when coalesce(array_length(services, 1), 0) = 0
    then array[
      'OPD consultation',
      'Video consultation',
      'Pulmonary function assessment guidance',
      'Inpatient respiratory care'
    ] else services end,
  experience_timeline = case when coalesce(array_length(experience_timeline, 1), 0) = 0
    then array[
      'Ex Consultant Pulmonologist',
      'Ex Assistant Professor',
      'Extensive experience in complex respiratory disorders',
      'Expertise in critical care and ICU management'
    ] else experience_timeline end,
  consultation_timings = case when coalesce(consultation_timings, '') = ''
    then 'Mon–Sat · 9:00 AM – 8:00 PM (by appointment)'
    else consultation_timings end,
  is_featured = true,
  video_consultation_fee = coalesce(video_consultation_fee, 400),
  seo_title = coalesce(nullif(seo_title, ''), name || ' | Pulmonologist, Badvel'),
  seo_description = coalesce(
    nullif(seo_description, ''),
    left(coalesce(biography, 'Consultant pulmonologist at Sri Srinivasa Hospital, Badvel.'), 160)
  ),
  faqs = case
    when faqs is null or faqs = '[]'::jsonb then
      '[
        {"question":"When should I see a pulmonologist?","answer":"If you have persistent cough, breathlessness, wheezing, sleep snoring with daytime sleepiness, or known asthma/COPD needing specialist care."},
        {"question":"Do you offer video consultations?","answer":"Yes. Book a video consult online or call the hospital reception for available slots."},
        {"question":"How do I prepare for my first visit?","answer":"Bring previous reports, inhaler list, and a short history of symptoms. Arrive 10–15 minutes early."}
      ]'::jsonb
    else faqs
  end
where lower(name) like '%varaprasad%';

comment on column public.hospital_doctors.slug is 'Public profile path /doctors/{slug}';
comment on column public.hospital_doctors.faqs is 'JSON array of {question, answer}';
comment on column public.hospital_doctors.is_featured is 'Highlight on /doctors listing and home';
