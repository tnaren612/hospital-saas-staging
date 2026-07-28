-- =============================================================================
-- Phase 4 — Health Packages CMS
-- Idempotent. Reuses departments. Images via Gallery CMS (section=package).
-- =============================================================================

create table if not exists public.health_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subtitle text not null default '',
  short_description text not null default '',
  description text not null default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  offer_price numeric(12,2) check (offer_price is null or offer_price >= 0),
  currency text not null default 'INR',
  department_id uuid references public.departments (id) on delete set null,
  featured boolean not null default false,
  popular boolean not null default false,
  package_type text not null default 'general'
    check (package_type in (
      'general', 'executive', 'senior', 'women', 'men', 'child',
      'cardiac', 'diabetes', 'respiratory', 'preventive', 'pre-employment', 'other'
    )),
  duration text not null default '',
  report_time text not null default '',
  preparation text not null default '',
  tests_included jsonb not null default '[]'::jsonb,
  services_included jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  hero_image text not null default '',
  banner_image text not null default '',
  gallery_images jsonb not null default '[]'::jsonb,
  icon text not null default '',
  brochure_pdf text not null default '',
  booking_enabled boolean not null default true,
  is_active boolean not null default true,
  display_order integer not null default 0,
  seo_title text,
  seo_description text,
  meta_keywords text[] not null default '{}',
  -- Payment-ready (future Razorpay / Stripe) — unused for now
  payment_enabled boolean not null default false,
  payment_amount numeric(12,2),
  payment_currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_packages_active_order_idx
  on public.health_packages (is_active, display_order, name);

create index if not exists health_packages_department_idx
  on public.health_packages (department_id);

create index if not exists health_packages_featured_idx
  on public.health_packages (featured, popular)
  where is_active = true;

create index if not exists health_packages_type_idx
  on public.health_packages (package_type)
  where is_active = true;

drop trigger if exists health_packages_set_updated_at on public.health_packages;
create trigger health_packages_set_updated_at
  before update on public.health_packages
  for each row execute function public.set_updated_at();

alter table public.health_packages enable row level security;

drop policy if exists "Packages: public read active" on public.health_packages;
create policy "Packages: public read active"
  on public.health_packages for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Packages: admin write" on public.health_packages;
create policy "Packages: admin write"
  on public.health_packages for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed packages (idempotent by slug)
insert into public.health_packages (
  slug, name, subtitle, short_description, description,
  price, offer_price, package_type, duration, report_time, preparation,
  tests_included, services_included, benefits, faqs,
  featured, popular, display_order, booking_enabled, is_active,
  seo_title, seo_description
)
values
(
  'basic-lung-health-check',
  'Basic Lung Health Check',
  'Essential respiratory screening',
  'Essential screening for common respiratory concerns.',
  'A focused package for patients with mild respiratory symptoms, cough, or those seeking baseline lung health evaluation with a pulmonologist.',
  1999, 1499, 'respiratory', '2–3 hours', 'Same day / next day',
  'Avoid heavy meals 2 hours before spirometry. Bring previous reports and current medicines.',
  '["Pulmonologist consultation","Spirometry (PFT basic)","Chest X-ray review","Oxygen saturation check"]'::jsonb,
  '["Personalized advice","Care plan discussion"]'::jsonb,
  '["Early detection","Specialist guidance","Transparent pricing"]'::jsonb,
  '[{"question":"Who should take this package?","answer":"Adults with cough, mild breathlessness, smokers, or anyone wanting a basic lung check."}]'::jsonb,
  false, false, 10, true, true,
  'Basic Lung Health Check | Sri Srinivasa Hospital Badvel',
  'Affordable basic lung screening with pulmonologist consultation and spirometry in Badvel.'
),
(
  'comprehensive-respiratory-package',
  'Comprehensive Respiratory Package',
  'In-depth lung evaluation',
  'In-depth evaluation for asthma, COPD, and chronic breathlessness.',
  'Designed for chronic respiratory conditions. Includes specialist consultation, full pulmonary assessment guidance, and a structured treatment action plan.',
  4999, 3499, 'respiratory', 'Half day', '24–48 hours',
  'Wear comfortable clothing. Inform staff of recent infections or pregnancy before imaging.',
  '["Specialist consultation","Full pulmonary function tests","Chest imaging coordination","Allergy screening guidance"]'::jsonb,
  '["Treatment action plan","One free follow-up visit"]'::jsonb,
  '["Complete evaluation","Follow-up included","Suitable for asthma & COPD"]'::jsonb,
  '[{"question":"Is imaging included?","answer":"Imaging is coordinated as clinically indicated; actual scan charges may be billed separately depending on hospital policy."}]'::jsonb,
  true, true, 20, true, true,
  'Comprehensive Respiratory Package | Badvel Pulmonology',
  'Comprehensive lung package for asthma, COPD and chronic breathlessness at Sri Srinivasa Hospital.'
),
(
  'senior-citizen-lung-care',
  'Senior Citizen Lung Care',
  'Age-focused respiratory package',
  'Age-focused package for elders with chronic respiratory issues.',
  'Gentle, senior-friendly evaluation covering lung function, medication review, and practical home-care guidance.',
  3299, 2499, 'senior', '2–4 hours', 'Same day / next day',
  'Come with a family member if possible. Bring all medicines and prior reports.',
  '["Geriatric pulmonology consult","Spirometry","ECG coordination","Medication review"]'::jsonb,
  '["Home care tips","Caregiver guidance"]'::jsonb,
  '["Elder-friendly process","Medication safety","Specialist oversight"]'::jsonb,
  '[]'::jsonb,
  true, false, 30, true, true,
  'Senior Citizen Lung Care Package | Badvel',
  'Senior-focused lung care package with specialist consult and spirometry.'
),
(
  'post-covid-recovery-package',
  'Post-COVID Recovery Package',
  'Rebuild lung stamina safely',
  'Rehabilitation-focused package for lingering respiratory symptoms.',
  'For patients with post-COVID fatigue, cough, or reduced exercise tolerance. Includes assessment and recovery planning.',
  3999, 2999, 'respiratory', 'Half day', '24–48 hours',
  'Avoid strenuous exercise the morning of tests. Stay hydrated.',
  '["Specialist assessment","Lung function evaluation"]'::jsonb,
  '["Breathing exercise plan","Nutritional guidance","Follow-up scheduling"]'::jsonb,
  '["Structured recovery","Specialist supervision"]'::jsonb,
  '[]'::jsonb,
  false, true, 40, true, true,
  'Post-COVID Recovery Package | Sri Srinivasa Hospital',
  'Post-COVID lung recovery package with assessment and rehabilitation guidance.'
),
(
  'executive-health-checkup',
  'Executive Health Checkup',
  'Busy professionals, complete screening',
  'Time-efficient multi-system preventive checkup with respiratory focus.',
  'Ideal for working professionals who want a structured preventive evaluation including vitals, labs coordination, and specialist review.',
  7999, 5999, 'executive', '1 day', '24–48 hours',
  'Fasting 8–10 hours may be required for blood tests. Confirm the day before.',
  '["Vitals & BMI","Basic blood panel coordination","Chest evaluation","Specialist review"]'::jsonb,
  '["Priority scheduling","Summary report discussion"]'::jsonb,
  '["One-day convenience","Preventive insight"]'::jsonb,
  '[]'::jsonb,
  true, true, 5, true, true,
  'Executive Health Checkup | Badvel Hospital',
  'Executive health package with priority scheduling at Sri Srinivasa Hospital, Badvel.'
),
(
  'asthma-evaluation-package',
  'Asthma Evaluation Package',
  'Control symptoms with a clear plan',
  'Focused evaluation and action plan for suspected or known asthma.',
  'Includes clinical assessment, lung function guidance, trigger discussion, and an asthma action plan tailored by our pulmonology team.',
  3499, 2799, 'respiratory', '2–3 hours', 'Same day',
  'Bring inhalers. Avoid smoking before testing if advised.',
  '["Asthma-focused consultation","Spirometry","Inhaler technique review"]'::jsonb,
  '["Written action plan","Follow-up guidance"]'::jsonb,
  '["Better symptom control","Education included"]'::jsonb,
  '[]'::jsonb,
  false, false, 50, true, true,
  'Asthma Evaluation Package | Pulmonology Badvel',
  'Asthma evaluation package with specialist consultation and action plan.'
),
(
  'copd-assessment-package',
  'COPD Assessment Package',
  'Specialist assessment for chronic breathlessness',
  'Structured COPD assessment for smokers and patients with chronic cough.',
  'Evaluation for COPD risk, lung function assessment guidance, and long-term management planning.',
  3999, 3199, 'respiratory', 'Half day', '24 hours',
  'List all respiratory medicines. Bring prior X-rays if available.',
  '["COPD consult","Spirometry","Risk factor review"]'::jsonb,
  '["Management plan","Lifestyle counselling"]'::jsonb,
  '["Early staging insight","Specialist care"]'::jsonb,
  '[]'::jsonb,
  false, false, 60, true, true,
  'COPD Assessment Package | Sri Srinivasa Hospital',
  'COPD assessment package for chronic breathlessness and smoker screening.'
),
(
  'pre-employment-medical-checkup',
  'Pre-Employment Medical Checkup',
  'Fitness certificate support',
  'Pre-employment screening package coordinated for workplace requirements.',
  'Useful for job fitness, industrial, and institutional medical clearance needs. Components can be tailored to employer checklists.',
  2499, 1999, 'pre-employment', '2–4 hours', 'Same day / 24 hours',
  'Bring government ID and employer form if any.',
  '["General examination","Basic investigations coordination","Fitness opinion"]'::jsonb,
  '["Report packaging for employer"]'::jsonb,
  '["Fast turnaround","Transparent process"]'::jsonb,
  '[]'::jsonb,
  false, false, 70, true, true,
  'Pre-Employment Medical Checkup | Badvel',
  'Pre-employment medical checkup packages at Sri Srinivasa Hospital, Badvel.'
)
on conflict (slug) do nothing;

-- Link respiratory packages to Pulmonology department when present
update public.health_packages p
set department_id = d.id
from public.departments d
where d.slug = 'pulmonology'
  and p.package_type = 'respiratory'
  and p.department_id is null;

comment on table public.health_packages is
  'Health Packages CMS. Images via Gallery CMS section=package (hero/banner/gallery/icon). payment_* reserved for future gateways.';
