# Replaceable images

All site images are referenced by **path** from JSON/config under `src/data/`.

## Recommended layout

```
hospital/
  building.svg|jpg|webp   ← Hero / About building photo
  hero.svg
  logo.svg
  og-image.svg|jpg        ← Social share image (1200×630)
doctor/
  profile.svg|jpg         ← Doctor portrait
  gallery-1…4.svg|jpg
gallery/
  *.svg|jpg
services/
facilities/
blog/
packages/
testimonials/
insurance/
placeholders/
```

## How to replace

1. Drop your real photo into the matching folder.
2. Update the path in the related JSON file, for example:
   - `src/data/images.json`
   - `src/data/doctor.json`
   - `src/data/gallery.json`
3. Prefer WebP/AVIF for production performance.

Never hardcode image URLs inside React components.
