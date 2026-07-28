-- =============================================================================
-- Blog CMS — single source of truth (replaces blog.json + localStorage)
-- Run in Supabase SQL Editor after 001–005
-- =============================================================================

-- Table: blog_articles
create table if not exists public.blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content text not null,
  category text not null default 'general'
    check (category in (
      'lungs', 'asthma', 'covid', 'general', 'copd', 'critical-care'
    )),
  cover_image text not null default '',
  tags text[] not null default '{}',
  author text not null default 'Dr. Varaprasad Venkata Sumanth',
  published_at date not null default (current_date),
  read_time integer not null default 5 check (read_time >= 1),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_articles_slug_idx
  on public.blog_articles (slug);

create index if not exists blog_articles_category_idx
  on public.blog_articles (category);

create index if not exists blog_articles_published_idx
  on public.blog_articles (is_published, published_at desc);

drop trigger if exists blog_articles_set_updated_at on public.blog_articles;
create trigger blog_articles_set_updated_at
  before update on public.blog_articles
  for each row execute function public.set_updated_at();

-- RLS
alter table public.blog_articles enable row level security;

drop policy if exists "Blog: public read published" on public.blog_articles;
create policy "Blog: public read published"
  on public.blog_articles for select
  to anon, authenticated
  using (is_published = true or public.is_admin());

drop policy if exists "Blog: admin write" on public.blog_articles;
create policy "Blog: admin write"
  on public.blog_articles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Optional: copy rows from legacy public.articles (if any were inserted earlier)
insert into public.blog_articles (
  id, slug, title, excerpt, content, category, cover_image, tags, author,
  published_at, read_time, is_published, created_at, updated_at
)
select
  a.id,
  a.slug,
  a.title,
  coalesce(a.excerpt, ''),
  a.content,
  case
    when a.category in ('lungs','asthma','covid','general','copd','critical-care')
      then a.category
    else 'general'
  end,
  coalesce(a.cover_image, ''),
  coalesce(a.tags, '{}'),
  coalesce(a.author, 'Dr. Varaprasad Venkata Sumanth'),
  coalesce(a.published_at, current_date),
  coalesce(a.read_time, 5),
  coalesce(a.is_published, true),
  a.created_at,
  a.updated_at
from public.articles a
where exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'articles'
)
and not exists (
  select 1 from public.blog_articles b where b.slug = a.slug
)
on conflict (slug) do nothing;

-- Seed default health tips (skip if already present)
insert into public.blog_articles (
  slug, title, excerpt, content, category, cover_image, tags, author,
  published_at, read_time, is_published
)
values
(
  'understanding-asthma-triggers',
  'Understanding Asthma Triggers in Indian Climate',
  'Learn how dust, pollen, pollution, and seasonal changes affect asthma — and practical ways to stay in control.',
  E'## Why asthma flares up\n\nAsthma symptoms often worsen with allergens, air pollution, cold air, exercise, and respiratory infections. In regions like Andhra Pradesh, dust and seasonal changes can be significant triggers.\n\n## Common triggers\n\n- Dust mites and mold\n- Outdoor air pollution\n- Cigarette smoke\n- Viral infections\n- Strong fragrances and cleaning chemicals\n\n## What you can do\n\n1. Keep inhalers accessible and use them as prescribed.\n2. Monitor peak flow if advised by your doctor.\n3. Avoid known allergens and smoke exposure.\n4. Seek medical help for night-time symptoms or frequent rescue inhaler use.\n\n## When to visit a pulmonologist\n\nIf you experience wheezing, chest tightness, or breathlessness more than twice a week, schedule a consultation for a personalized asthma action plan.',
  'asthma',
  '/assets/images/blog/asthma-triggers.svg',
  array['asthma','prevention','lungs'],
  'Dr. Varaprasad Venkata Sumanth',
  '2026-01-15',
  5,
  true
),
(
  'copd-breathing-exercises',
  'Simple Breathing Exercises for COPD Patients',
  'Evidence-informed breathing techniques that can help reduce breathlessness and improve daily activity.',
  E'## Living better with COPD\n\nCOPD can limit daily activities, but structured breathing techniques and pulmonary rehabilitation principles can improve comfort and stamina.\n\n## Techniques to try\n\n### Pursed-lip breathing\nInhale slowly through the nose, then exhale gently through pursed lips as if blowing out a candle.\n\n### Diaphragmatic breathing\nPlace a hand on your abdomen and breathe so that the belly rises more than the chest.\n\n## Important\n\nAlways practice under medical guidance, especially if you use oxygen therapy or have recent exacerbations.',
  'copd',
  '/assets/images/blog/copd-exercises.svg',
  array['copd','exercise','rehabilitation'],
  'Dr. Varaprasad Venkata Sumanth',
  '2026-02-02',
  6,
  true
),
(
  'when-to-seek-emergency-respiratory-care',
  'When to Seek Emergency Respiratory Care',
  'Know the red-flag symptoms of severe breathlessness that need immediate hospital attention.',
  E'## Red-flag symptoms\n\nCall emergency services or reach the hospital immediately if you notice:\n\n- Sudden severe breathlessness\n- Bluish lips or fingertips\n- Confusion or extreme drowsiness\n- Chest pain with breathing difficulty\n- Inability to speak full sentences\n\n## Why minutes matter\n\nRespiratory failure can escalate quickly. Early oxygen support, medications, and critical care monitoring can be life-saving.\n\nSri Srinivasa Hospital provides 24×7 emergency and ICU support for respiratory emergencies.',
  'lungs',
  '/assets/images/blog/emergency.svg',
  array['emergency','critical care','lungs'],
  'Dr. Varaprasad Venkata Sumanth',
  '2026-02-20',
  4,
  true
),
(
  'post-covid-lung-recovery-tips',
  'Post-COVID Lung Recovery: Practical Tips',
  'How to rebuild lung stamina safely after COVID-19 with medical supervision and gradual activity.',
  E'## Recovery takes patience\n\nSome people experience lingering cough, fatigue, or reduced exercise tolerance after COVID-19. A structured recovery plan helps.\n\n## Tips\n\n- Resume activity gradually\n- Stay hydrated and rest adequately\n- Practice breathing exercises recommended by your doctor\n- Avoid smoking and polluted environments\n- Attend follow-up evaluations if symptoms persist\n\n## Get specialist help\n\nIf breathlessness continues beyond a few weeks, consult a pulmonologist for evaluation and a tailored rehabilitation plan.',
  'covid',
  '/assets/images/blog/post-covid.svg',
  array['covid','recovery','lungs'],
  'Dr. Varaprasad Venkata Sumanth',
  '2026-03-08',
  5,
  true
),
(
  'protecting-lungs-from-air-pollution',
  'Protecting Your Lungs from Air Pollution',
  'Everyday strategies to reduce pollution exposure and protect long-term lung health.',
  E'## Pollution and your lungs\n\nFine particulate matter can inflame airways and worsen asthma and COPD.\n\n## Protection strategies\n\n- Check air quality when planning outdoor activity\n- Use masks on high-pollution days if advised\n- Keep indoor air cleaner with ventilation and reduced smoke\n- Avoid outdoor exercise near heavy traffic during peak hours\n\n## High-risk groups\n\nChildren, elders, and people with chronic lung disease should be especially careful and maintain regular medical follow-up.',
  'general',
  '/assets/images/blog/pollution.svg',
  array['prevention','pollution','general health'],
  'Dr. Varaprasad Venkata Sumanth',
  '2026-03-28',
  4,
  true
),
(
  'sleep-apnea-warning-signs',
  'Sleep Apnea: Warning Signs You Shouldn''t Ignore',
  'Loud snoring, daytime sleepiness, and morning headaches may signal obstructive sleep apnea.',
  E'## What is sleep apnea?\n\nObstructive sleep apnea causes repeated breathing pauses during sleep, reducing oxygen levels and fragmenting rest.\n\n## Warning signs\n\n- Loud, chronic snoring\n- Witnessed breathing pauses\n- Daytime sleepiness\n- Morning headaches\n- Difficulty concentrating\n\n## Why treatment matters\n\nUntreated sleep apnea is linked to hypertension, heart disease, and accidents due to drowsiness. Evaluation by a specialist can guide CPAP therapy and lifestyle measures.',
  'lungs',
  '/assets/images/blog/sleep-apnea.svg',
  array['sleep','lungs','diagnosis'],
  'Dr. Varaprasad Venkata Sumanth',
  '2026-04-12',
  5,
  true
)
on conflict (slug) do nothing;

comment on table public.blog_articles is
  'Health Tips / Blog CMS — single source of truth. Cover images use Gallery CMS (section=blog, key=image) public URLs.';
