-- Staging validation tenants and CMS content.
-- Idempotent and intentionally contains no real patient or credential data.

insert into public.hospitals (slug, name, hospital_type, status)
values
  ('default', 'Demo Hospital', 'multi_specialty', 'active'),
  ('hospital-alpha', 'Hospital Alpha', 'multi_specialty', 'active'),
  ('hospital-beta', 'Hospital Beta', 'super_specialty', 'active'),
  ('hospital-gamma', 'Hospital Gamma', 'clinic', 'active')
on conflict (slug) do update
set name = excluded.name,
    hospital_type = excluded.hospital_type,
    status = excluded.status,
    updated_at = now();

insert into public.hospital_settings (
  hospital_id, branding, contact, localization, legal, modules, prefixes,
  payments, email, storage, auth_providers, templates, seo, social,
  working_hours
)
select
  h.id,
  jsonb_build_object(
    'name', h.name,
    'tagline', case h.slug
      when 'hospital-alpha' then 'Compassionate family healthcare'
      when 'hospital-beta' then 'Advanced specialty medicine'
      when 'hospital-gamma' then 'Care close to home'
      else 'Configurable healthcare for every community'
    end,
    'logo_url', '/icons/icon-192.svg',
    'favicon_url', '/favicon.ico',
    'banner_url', '',
    'primary_color', case h.slug
      when 'hospital-alpha' then '#1d4ed8'
      when 'hospital-beta' then '#7c3aed'
      when 'hospital-gamma' then '#047857'
      else '#0f766e'
    end,
    'secondary_color', case h.slug
      when 'hospital-alpha' then '#0ea5e9'
      when 'hospital-beta' then '#db2777'
      when 'hospital-gamma' then '#65a30d'
      else '#2563eb'
    end,
    'theme', 'default',
    'dark_mode_default', false
  ),
  jsonb_build_object(
    'email', concat('contact@', replace(h.slug, '-', ''), '.example'),
    'support_email', concat('support@', replace(h.slug, '-', ''), '.example'),
    'billing_email', concat('billing@', replace(h.slug, '-', ''), '.example'),
    'phones', jsonb_build_array(
      case h.slug
        when 'hospital-alpha' then '+91 2200001001'
        when 'hospital-beta' then '+91 2200002001'
        when 'hospital-gamma' then '+91 2200003001'
        else '+91 2200000001'
      end
    ),
    'emergency_phone', case h.slug
      when 'hospital-alpha' then '+91 2200001010'
      when 'hospital-beta' then '+91 2200002010'
      when 'hospital-gamma' then '+91 2200003010'
      else '+91 2200000010'
    end,
    'website', concat('https://', h.slug, '.example'),
    'address_line1', concat('Staging Campus, ', initcap(replace(h.slug, '-', ' '))),
    'city', 'Mumbai',
    'state', 'Maharashtra',
    'pincode', '400001',
    'country', 'India'
  ),
  '{"timezone":"Asia/Kolkata","language":"en","currency":"INR","currency_symbol":"₹","date_format":"dd MMM yyyy","time_format":"12h","week_start":"monday","financial_year_start_month":4}'::jsonb,
  jsonb_build_object(
    'footer_text', concat('© ', extract(year from now())::int, ' ', h.name, '. All rights reserved.'),
    'terms_url', '/terms',
    'privacy_url', '/privacy',
    'tax_percent', 0
  ),
  '{"appointments":true,"reception":true,"doctors":true,"patients":true,"laboratory":true,"pharmacy":true,"billing":true,"finance":true,"hr":true,"reports":true,"cms":true,"notifications":true,"online_booking":true,"patient_portal":true,"doctor_portal":true,"opd":true,"emergency":true,"insurance":true,"inventory":true,"ipd":true,"radiology":true}'::jsonb,
  '{"appointment":"APT","patient":"PAT","invoice":"INV","receipt":"RCT","prescription":"RX","lab_report":"LAB","employee":"EMP","doctor":"DR","barcode":"BC"}'::jsonb,
  '{"cash_enabled":true,"upi_enabled":false,"bank_transfer_enabled":false,"insurance_enabled":true,"razorpay_enabled":false,"stripe_enabled":false}'::jsonb,
  jsonb_build_object(
    'provider', 'smtp',
    'from_name', h.name,
    'from_email', concat('noreply@', replace(h.slug, '-', ''), '.example')
  ),
  '{"provider":"supabase","public_base_url":""}'::jsonb,
  '{"email_login":true,"phone_login":true,"otp_login":true,"google_login":false,"mfa":false}'::jsonb,
  jsonb_build_object(
    'email_footer', concat('Thank you for choosing ', h.name, '.'),
    'sms_signature', left(h.name, 20),
    'whatsapp_greeting', concat('Hello, this is ', h.name, '.'),
    'pdf_header', h.name,
    'pdf_footer', concat(h.name, ' · Mumbai'),
    'invoice_note', 'Thank you for your payment.',
    'prescription_note', 'Follow dosage instructions carefully.',
    'report_note', 'This report is computer generated.'
  ),
  jsonb_build_object(
    'meta_title', h.name,
    'meta_description', concat(h.name, ' staging website and patient services.'),
    'og_image_url', '',
    'keywords', concat(lower(h.name), ', healthcare, hospital, mumbai')
  ),
  '{}'::jsonb,
  '{"opd":"Monday–Saturday, 8:00 AM–8:00 PM","emergency":"24×7"}'::jsonb
from public.hospitals h
where h.slug in ('default', 'hospital-alpha', 'hospital-beta', 'hospital-gamma')
on conflict (hospital_id) do update set
  branding = excluded.branding,
  contact = excluded.contact,
  localization = excluded.localization,
  legal = excluded.legal,
  modules = excluded.modules,
  prefixes = excluded.prefixes,
  payments = excluded.payments,
  email = excluded.email,
  storage = excluded.storage,
  auth_providers = excluded.auth_providers,
  templates = excluded.templates,
  seo = excluded.seo,
  social = excluded.social,
  working_hours = excluded.working_hours;

with page_catalog(page_key, slug, label, summary) as (
  values
    ('home', 'home', 'Home', 'Welcome to configurable, patient-centered care.'),
    ('about', 'about', 'About', 'Learn about our mission, values, and care teams.'),
    ('services', 'services', 'Services', 'Explore hospital services configured for this tenant.'),
    ('facilities', 'facilities', 'Facilities', 'Discover our clinical facilities and patient amenities.'),
    ('insurance', 'insurance', 'Insurance', 'Review accepted insurance and cashless-care guidance.'),
    ('faq', 'faq', 'Frequently Asked Questions', 'Answers maintained by the hospital administrator.'),
    ('careers', 'careers', 'Careers', 'Join our healthcare team.'),
    ('contact', 'contact', 'Contact', 'Contact the hospital or request assistance.'),
    ('privacy', 'privacy', 'Privacy Policy', 'This staging policy must be replaced with approved legal text.'),
    ('terms', 'terms', 'Terms and Conditions', 'This staging policy must be replaced with approved legal text.'),
    ('header', 'header', 'Header', 'Tenant website header content.'),
    ('footer', 'footer', 'Footer', 'Tenant website footer content.')
)
insert into public.cms_pages (
  hospital_id, page_key, title, slug, status, content, seo, published_at
)
select
  h.id,
  p.page_key,
  p.label,
  p.slug,
  'published',
  jsonb_build_object(
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', concat(p.page_key, '-hero'),
        'type', 'hero',
        'title', concat(p.label, ' · ', h.name),
        'subtitle', p.summary
      ),
      jsonb_build_object(
        'id', concat(p.page_key, '-body'),
        'type', 'rich_text',
        'title', p.label,
        'body', concat(p.summary, E'\n\nThis content is owned by ', h.name, ' and managed through the tenant CMS.')
      )
    )
  ),
  jsonb_build_object(
    'title', concat(p.label, ' | ', h.name),
    'description', p.summary,
    'keywords', concat(lower(p.label), ', ', lower(h.name))
  ),
  now()
from public.hospitals h
cross join page_catalog p
where h.slug in ('default', 'hospital-alpha', 'hospital-beta', 'hospital-gamma')
on conflict (hospital_id, page_key) do update set
  title = excluded.title,
  slug = excluded.slug,
  status = excluded.status,
  content = excluded.content,
  seo = excluded.seo,
  published_at = excluded.published_at,
  updated_at = now();

insert into public.cms_navigation (hospital_id, location, items)
select
  h.id,
  n.location,
  n.items
from public.hospitals h
cross join (
  values
    ('header', '[{"id":"home","label":"Home","href":"/","order":0,"visible":true},{"id":"about","label":"About","href":"/about","order":1,"visible":true},{"id":"services","label":"Services","href":"/services","order":2,"visible":true},{"id":"doctors","label":"Doctors","href":"/doctors","order":3,"visible":true},{"id":"contact","label":"Contact","href":"/contact","order":4,"visible":true}]'::jsonb),
    ('footer', '[{"id":"privacy","label":"Privacy","href":"/privacy","order":0,"visible":true},{"id":"terms","label":"Terms","href":"/terms","order":1,"visible":true},{"id":"faq","label":"FAQ","href":"/faq","order":2,"visible":true}]'::jsonb),
    ('utility', '[{"id":"appointment","label":"Book appointment","href":"/appointment","order":0,"visible":true},{"id":"patient","label":"Patient login","href":"/patient/login","order":1,"visible":true}]'::jsonb)
) as n(location, items)
where h.slug in ('default', 'hospital-alpha', 'hospital-beta', 'hospital-gamma')
on conflict (hospital_id, location) do update
set items = excluded.items, updated_at = now();

insert into public.cms_announcements (
  hospital_id, title, message, link_url, status, starts_at
)
select
  h.id,
  concat(h.name, ' staging notice'),
  'This is isolated staging content. Do not enter real patient information.',
  '/contact',
  'published',
  now()
from public.hospitals h
where h.slug in ('default', 'hospital-alpha', 'hospital-beta', 'hospital-gamma')
  and not exists (
    select 1
    from public.cms_announcements a
    where a.hospital_id = h.id
      and a.title = concat(h.name, ' staging notice')
  );

insert into public.tenant_onboarding (
  hospital_id, current_step, completed_steps, status, checklist, completed_at
)
select
  h.id,
  6,
  array[1, 2, 3, 4, 5, 6],
  'completed',
  '{"branding":true,"contact":true,"cms":true,"navigation":true,"seo":true}'::jsonb,
  now()
from public.hospitals h
where h.slug in ('default', 'hospital-alpha', 'hospital-beta', 'hospital-gamma')
on conflict (hospital_id) do update set
  current_step = excluded.current_step,
  completed_steps = excluded.completed_steps,
  status = excluded.status,
  checklist = excluded.checklist,
  completed_at = excluded.completed_at,
  updated_at = now();
