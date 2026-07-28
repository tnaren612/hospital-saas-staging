-- =============================================================================
-- Centralized image CMS — extend gallery_images (ONE table for entire site)
-- Run in Supabase SQL Editor
-- =============================================================================

-- New columns (idempotent)
alter table public.gallery_images
  add column if not exists section text not null default 'gallery';

alter table public.gallery_images
  add column if not exists key text not null default 'image';

alter table public.gallery_images
  add column if not exists title text not null default '';

alter table public.gallery_images
  add column if not exists alt_text text;

alter table public.gallery_images
  add column if not exists image_url text;

alter table public.gallery_images
  add column if not exists is_active boolean not null default true;

alter table public.gallery_images
  add column if not exists updated_at timestamptz not null default now();

-- Backfill from legacy columns
update public.gallery_images
set
  image_url = coalesce(nullif(image_url, ''), public_url),
  alt_text = coalesce(nullif(alt_text, ''), alt, title, ''),
  section = coalesce(nullif(section, ''), 'gallery'),
  key = case
    when coalesce(nullif(key, ''), 'image') = 'image'
      and category is not null then coalesce(nullif(category, ''), 'image')
    else coalesce(nullif(key, ''), 'image')
  end
where true;

-- Keep public_url in sync for older readers
update public.gallery_images
set public_url = image_url
where (public_url is null or public_url = '') and image_url is not null;

update public.gallery_images
set alt = coalesce(nullif(alt, ''), alt_text, '')
where true;

-- Indexes for CMS lookups
create index if not exists gallery_images_section_key_idx
  on public.gallery_images (section, key)
  where is_active = true;

create index if not exists gallery_images_section_idx
  on public.gallery_images (section)
  where is_active = true;

create index if not exists gallery_images_active_sort_idx
  on public.gallery_images (is_active, sort_order);

drop trigger if exists gallery_images_set_updated_at on public.gallery_images;
create trigger gallery_images_set_updated_at
  before update on public.gallery_images
  for each row execute function public.set_updated_at();

-- Public read remains open for active images (existing policy may already allow all select)
drop policy if exists "Gallery: public read active" on public.gallery_images;
create policy "Gallery: public read active"
  on public.gallery_images for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

-- Admin write (recreate if missing)
drop policy if exists "Gallery: admin write" on public.gallery_images;
create policy "Gallery: admin write"
  on public.gallery_images for all
  using (public.is_admin())
  with check (public.is_admin());
