/**
 * Seed professional royalty-free cover images for Health Tips.
 * Uses the SAME Gallery CMS architecture:
 *   - Storage bucket: gallery
 *   - Path: blog/image/{timestamp}-{name}.webp
 *   - gallery_images: section=blog, key=image
 *   - articles/blog_articles.cover_image = public URL
 *
 * Usage: node scripts/seed-blog-covers.mjs
 *        node scripts/seed-blog-covers.mjs --reuse-gallery  (skip re-download if gallery row exists)
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TMP = path.join(ROOT, ".tmp", "blog-covers");
const REUSE = process.argv.includes("--reuse-gallery");

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
}

const supabase = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "gallery";
const SECTION = "blog";
const KEY = "image";

const ARTICLES = [
  {
    slug: "understanding-asthma-triggers",
    title: "Understanding Asthma Triggers in Indian Climate",
    category: "asthma",
    tags: ["asthma", "prevention", "lungs"],
    excerpt:
      "Learn how dust, pollen, pollution, and seasonal changes affect asthma — and practical ways to stay in control.",
    content: `## Why asthma flares up

Asthma symptoms often worsen with allergens, air pollution, cold air, exercise, and respiratory infections. In regions like Andhra Pradesh, dust and seasonal changes can be significant triggers.

## Common triggers

- Dust mites and mold
- Outdoor air pollution
- Cigarette smoke
- Viral infections
- Strong fragrances and cleaning chemicals

## What you can do

1. Keep inhalers accessible and use them as prescribed.
2. Monitor peak flow if advised by your doctor.
3. Avoid known allergens and smoke exposure.
4. Seek medical help for night-time symptoms or frequent rescue inhaler use.

## When to visit a pulmonologist

If you experience wheezing, chest tightness, or breathlessness more than twice a week, schedule a consultation for a personalized asthma action plan.`,
    published_at: "2026-01-15",
    read_time: 5,
    fileBase: "asthma-triggers",
    alt: "Doctor consultation for asthma and respiratory care",
    sourceName: "Unsplash (National Cancer Institute)",
    sourcePage: "https://unsplash.com/photos/L8tWZT4CcVQ",
    photoId: "photo-1576091160399-112ba8d25d1d",
    downloadUrl:
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "copd-breathing-exercises",
    title: "Simple Breathing Exercises for COPD Patients",
    category: "copd",
    tags: ["copd", "exercise", "rehabilitation"],
    excerpt:
      "Evidence-informed breathing techniques that can help reduce breathlessness and improve daily activity.",
    content: `## Living better with COPD

COPD can limit daily activities, but structured breathing techniques and pulmonary rehabilitation principles can improve comfort and stamina.

## Techniques to try

### Pursed-lip breathing
Inhale slowly through the nose, then exhale gently through pursed lips as if blowing out a candle.

### Diaphragmatic breathing
Place a hand on your abdomen and breathe so that the belly rises more than the chest.

## Important

Always practice under medical guidance, especially if you use oxygen therapy or have recent exacerbations.`,
    published_at: "2026-02-02",
    read_time: 6,
    fileBase: "copd-breathing",
    alt: "Person exercising outdoors for lung rehabilitation",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/DPEPYPBZpB8",
    photoId: "photo-1571019613454-1cb2f99b2d8b",
    downloadUrl:
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "when-to-seek-emergency-respiratory-care",
    title: "When to Seek Emergency Respiratory Care",
    category: "lungs",
    tags: ["emergency", "critical care", "lungs"],
    excerpt:
      "Know the red-flag symptoms of severe breathlessness that need immediate hospital attention.",
    content: `## Red-flag symptoms

Call emergency services or reach the hospital immediately if you notice:

- Sudden severe breathlessness
- Bluish lips or fingertips
- Confusion or extreme drowsiness
- Chest pain with breathing difficulty
- Inability to speak full sentences

## Why minutes matter

Respiratory failure can escalate quickly. Early oxygen support, medications, and critical care monitoring can be life-saving.

Sri Srinivasa Hospital provides 24×7 emergency and ICU support for respiratory emergencies.`,
    published_at: "2026-02-20",
    read_time: 4,
    fileBase: "emergency-respiratory",
    alt: "Hospital corridor for emergency and critical care",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/NFvdKIhxYlU",
    photoId: "photo-1516549655169-df83a0774514",
    downloadUrl:
      "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "post-covid-lung-recovery-tips",
    title: "Post-COVID Lung Recovery: Practical Tips",
    category: "covid",
    tags: ["covid", "recovery", "lungs"],
    excerpt:
      "How to rebuild lung stamina safely after COVID-19 with medical supervision and gradual activity.",
    content: `## Recovery takes patience

Some people experience lingering cough, fatigue, or reduced exercise tolerance after COVID-19. A structured recovery plan helps.

## Tips

- Resume activity gradually
- Stay hydrated and rest adequately
- Practice breathing exercises recommended by your doctor
- Avoid smoking and polluted environments
- Attend follow-up evaluations if symptoms persist

## Get specialist help

If breathlessness continues beyond a few weeks, consult a pulmonologist for evaluation and a tailored rehabilitation plan.`,
    published_at: "2026-03-08",
    read_time: 5,
    fileBase: "post-covid-recovery",
    alt: "Healthcare professional in protective mask — COVID awareness",
    sourceName: "Unsplash (CDC)",
    sourcePage: "https://unsplash.com/photos/pExvUHRnRZQ",
    photoId: "photo-1584036561566-baf8f5f1b144",
    downloadUrl:
      "https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "protecting-lungs-from-air-pollution",
    title: "Protecting Your Lungs from Air Pollution",
    category: "general",
    tags: ["prevention", "pollution", "general health"],
    excerpt:
      "Everyday strategies to reduce pollution exposure and protect long-term lung health.",
    content: `## Pollution and your lungs

Fine particulate matter can inflame airways and worsen asthma and COPD.

## Protection strategies

- Check air quality when planning outdoor activity
- Use masks on high-pollution days if advised
- Keep indoor air cleaner with ventilation and reduced smoke
- Avoid outdoor exercise near heavy traffic during peak hours

## High-risk groups

Children, elders, and people with chronic lung disease should be especially careful and maintain regular medical follow-up.`,
    published_at: "2026-03-28",
    read_time: 4,
    fileBase: "air-pollution-lungs",
    alt: "Clean forest air symbolizing healthy lungs and environment",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/5QgIuuBxKwM",
    photoId: "photo-1441974231531-c6227db76b6e",
    downloadUrl:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "sleep-apnea-warning-signs",
    title: "Sleep Apnea: Warning Signs You Shouldn't Ignore",
    category: "lungs",
    tags: ["sleep", "lungs", "diagnosis"],
    excerpt:
      "Loud snoring, daytime sleepiness, and morning headaches may signal obstructive sleep apnea.",
    content: `## What is sleep apnea?

Obstructive sleep apnea causes repeated breathing pauses during sleep, reducing oxygen levels and fragmenting rest.

## Warning signs

- Loud, chronic snoring
- Witnessed breathing pauses
- Daytime sleepiness
- Morning headaches
- Difficulty concentrating

## Why treatment matters

Untreated sleep apnea is linked to hypertension, heart disease, and accidents due to drowsiness. Evaluation by a specialist can guide CPAP therapy and lifestyle measures.`,
    published_at: "2026-04-12",
    read_time: 5,
    fileBase: "sleep-apnea",
    alt: "Peaceful sleep environment for healthy breathing rest",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/rTVGoz3_D4I",
    photoId: "photo-1541781774459-bb2af2f05b55",
    downloadUrl:
      "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "heart-healthy-habits-daily-life",
    title: "Heart-Healthy Habits for Everyday Life",
    category: "general",
    tags: ["heart", "prevention", "lifestyle"],
    excerpt:
      "Simple daily choices that support cardiovascular health and reduce long-term risk factors.",
    content: `## Why heart health matters

Cardiovascular disease remains a leading cause of illness worldwide. Small, consistent habits protect your heart over decades.

## Daily habits that help

- Walk briskly for at least 30 minutes most days
- Choose less salt and fewer ultra-processed foods
- Prefer fruits, vegetables, whole grains, and lean proteins
- Avoid tobacco in all forms
- Manage stress with rest, prayer, or light exercise

## When to get checked

Chest pain, unexplained breathlessness, swelling of the legs, or a strong family history of heart disease warrant medical evaluation. Ask your doctor about blood pressure, sugar, and cholesterol screening.`,
    published_at: "2026-04-20",
    read_time: 5,
    fileBase: "heart-healthy",
    alt: "Anatomical heart model for heart care education",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/s/photos/heart-health",
    photoId: "photo-1628348068343-c6a848d2b6dd",
    downloadUrl:
      "https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "nutrition-for-respiratory-wellness",
    title: "Nutrition Tips for Better Respiratory Wellness",
    category: "general",
    tags: ["nutrition", "lungs", "prevention"],
    excerpt:
      "How balanced meals, hydration, and key nutrients support lung function and recovery.",
    content: `## Food and breathing

While diet cannot replace inhalers or prescribed therapy, nutrition supports immunity, muscle strength, and recovery after respiratory illness.

## Practical plate tips

- Include colorful vegetables and fruits daily
- Prefer adequate protein for muscle and immune support
- Stay well hydrated unless your doctor advises otherwise
- Limit excess salt if you have fluid retention or heart disease
- Avoid smoking and second-hand smoke entirely

## Special situations

People with COPD may need smaller, more frequent meals. Those with food allergies or reflux should follow personalized advice — reflux can worsen cough and asthma symptoms.`,
    published_at: "2026-05-02",
    read_time: 4,
    fileBase: "nutrition-respiratory",
    alt: "Healthy balanced meal for nutrition and wellness",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/IGfIGP5ONV0",
    photoId: "photo-1490645935967-10de6ba17061",
    downloadUrl:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "preventive-health-checkups-guide",
    title: "Preventive Health Checkups: A Practical Guide",
    category: "general",
    tags: ["prevention", "screening", "wellness"],
    excerpt:
      "Why regular screenings matter and which checks adults commonly discuss with their doctor.",
    content: `## Prevention saves lives

Many serious conditions are quieter in early stages. Planned checkups help detect problems before complications appear.

## Common discussions with your doctor

- Blood pressure and blood sugar
- Cholesterol profile
- Weight and lifestyle review
- Vaccination status
- Lung symptoms if you cough, smoke, or have breathlessness

## Make it simple

Keep a list of medicines, past illnesses, and family history. Book appointments when you feel well — not only during crises. At Sri Srinivasa Hospital, our team can guide you on age-appropriate packages and specialist reviews.`,
    published_at: "2026-05-15",
    read_time: 5,
    fileBase: "preventive-checkups",
    alt: "Doctor reviewing medical records for preventive checkup",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/4ANXk6KnYGE",
    photoId: "photo-1576091160550-2173dba999ef",
    downloadUrl:
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "senior-care-breathing-comfort",
    title: "Senior Care: Keeping Breathing Comfortable with Age",
    category: "general",
    tags: ["senior care", "lungs", "prevention"],
    excerpt:
      "Gentle guidance for older adults on activity, vaccines, and when to seek lung care.",
    content: `## Aging lungs need attention

Lung capacity and immune resilience change with age. Thoughtful routines help seniors stay active and independent.

## Helpful steps

- Stay as mobile as safely possible with walking or chair exercises
- Keep influenza and pneumonia vaccines up to date as advised
- Avoid indoor smoke and strong chemical fumes
- Use prescribed inhalers correctly — ask a clinician to demonstrate technique
- Report new cough, fever, or sudden breathlessness promptly

## Family support

Caregivers can help track medicines, appointment dates, and warning symptoms. Early pulmonology review prevents many emergency visits.`,
    published_at: "2026-05-28",
    read_time: 5,
    fileBase: "senior-care",
    alt: "Healthcare professional supporting elderly patient care",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/NFvdKIhxYlU",
    photoId: "photo-1576765608535-5f04d1e3f289",
    downloadUrl:
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "vaccination-and-lung-protection",
    title: "Vaccination and Lung Protection: What Families Should Know",
    category: "general",
    tags: ["vaccination", "prevention", "family health"],
    excerpt:
      "How recommended vaccines help reduce severe respiratory infections for children and adults.",
    content: `## Vaccines protect airways

Respiratory infections can trigger asthma flares, COPD exacerbations, and serious pneumonia. Immunization remains a cornerstone of prevention.

## Talk to your clinician about

- Age-appropriate childhood vaccines
- Annual influenza vaccination when recommended
- Pneumococcal vaccines for eligible adults
- COVID-19 vaccination guidance based on current advice

## After vaccination

Mild arm soreness or low-grade fever can occur. Seek care for severe allergic reactions (rare). Vaccines complement — not replace — good hand hygiene, smoke-free homes, and prompt treatment of chronic lung disease.`,
    published_at: "2026-06-05",
    read_time: 4,
    fileBase: "vaccination-lungs",
    alt: "Medical professional preparing vaccination for patient",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/CdREWVT91o8",
    photoId: "photo-1615461066159-fea0960485d5",
    downloadUrl:
      "https://images.unsplash.com/photo-1615461066159-fea0960485d5?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
  {
    slug: "mental-wellness-chronic-illness",
    title: "Mental Wellness While Living with Chronic Illness",
    category: "general",
    tags: ["mental wellness", "chronic care", "support"],
    excerpt:
      "Practical ways to protect emotional health when managing long-term medical conditions.",
    content: `## Body and mind together

Living with asthma, COPD, diabetes, or other chronic conditions can bring worry, fatigue, and sleep disruption. Emotional care is part of good medical care.

## Supportive strategies

- Keep a simple daily routine for medicines and rest
- Share concerns with family or a trusted clinician
- Stay gently active within medical advice
- Limit late-night news overload about illness
- Seek professional help for persistent sadness, panic, or hopelessness

## You are not alone

Ask your care team about counseling resources and peer support. Managing stress often improves sleep, adherence to treatment, and overall quality of life.`,
    published_at: "2026-06-18",
    read_time: 5,
    fileBase: "mental-wellness",
    alt: "Calm yoga and mindfulness for mental wellness",
    sourceName: "Unsplash",
    sourcePage: "https://unsplash.com/photos/I2YSeUkN-G0",
    photoId: "photo-1506126613408-eca07ce68773",
    downloadUrl:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80&fm=webp",
  },
];

async function resolveBlogTable() {
  for (const name of ["blog_articles", "articles"]) {
    const { error } = await supabase.from(name).select("id").limit(1);
    if (!error) return name;
    if (!/schema cache|does not exist|could not find the table/i.test(error.message)) {
      // table exists but empty or other error — still usable
      return name;
    }
  }
  throw new Error(
    "No blog table found. Run migrations 001 (articles) or 006 (blog_articles)."
  );
}

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SriSrinivasaHospitalSeed/1.0 (hospital website image seed)",
      Accept: "image/webp,image/*,*/*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return {
    bytes: buf.length,
    contentType: res.headers.get("content-type") || "image/webp",
  };
}

function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function findExistingGallery(title, fileBase) {
  const { data } = await supabase
    .from("gallery_images")
    .select("id, storage_path, image_url, public_url, title")
    .eq("section", SECTION)
    .eq("key", KEY)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = data || [];
  const match =
    rows.find((r) => r.title === title) ||
    rows.find((r) => (r.storage_path || "").includes(fileBase));
  if (!match) return null;
  return {
    id: match.id,
    storage_path: match.storage_path,
    public_url: match.public_url || match.image_url,
    image_url: match.image_url || match.public_url,
    reused: true,
  };
}

async function uploadGalleryCover({ filePath, fileBase, alt, title, sort_order }) {
  const ext = path.extname(filePath).replace(".", "") || "webp";
  const base = sanitizeFileName(fileBase) || "image";
  const storage_path = `${SECTION}/${KEY}/${Date.now()}-${base}.${ext}`;
  const fileBuf = readFileSync(filePath);
  const contentType =
    ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, fileBuf, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storage_path);

  const { data, error } = await supabase
    .from("gallery_images")
    .insert({
      storage_path,
      public_url: publicUrl,
      image_url: publicUrl,
      alt,
      alt_text: alt,
      title: title || alt,
      category: SECTION,
      section: SECTION,
      key: KEY,
      sort_order,
      is_active: true,
    })
    .select("id, section, key, title, image_url, public_url, storage_path")
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([storage_path]);
    throw new Error(`gallery_images insert failed: ${error.message}`);
  }

  return {
    id: data.id,
    storage_path: data.storage_path,
    public_url: data.public_url || data.image_url,
    image_url: data.image_url || data.public_url,
    reused: false,
  };
}

async function upsertArticle(table, article, coverUrl) {
  const row = {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: article.category,
    cover_image: coverUrl,
    tags: article.tags,
    author: "Dr. Varaprasad Venkata Sumanth",
    published_at: article.published_at,
    read_time: article.read_time,
    is_published: true,
  };

  const { data: existing } = await supabase
    .from(table)
    .select("id")
    .eq("slug", article.slug)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from(table)
      .update({
        title: row.title,
        excerpt: row.excerpt,
        content: row.content,
        category: row.category,
        cover_image: row.cover_image,
        tags: row.tags,
        published_at: row.published_at,
        read_time: row.read_time,
        is_published: true,
      })
      .eq("id", existing.id)
      .select("id, slug, title, cover_image")
      .single();
    if (error) throw new Error(`update article: ${error.message}`);
    return { action: "updated", ...data };
  }

  const { data, error } = await supabase
    .from(table)
    .insert(row)
    .select("id, slug, title, cover_image")
    .single();
  if (error) throw new Error(`insert article: ${error.message}`);
  return { action: "created", ...data };
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  const table = await resolveBlogTable();
  console.log(`Blog table: ${table}`);
  console.log(
    `Mode: ${REUSE ? "reuse existing gallery rows when possible" : "upload fresh"}\n`
  );

  const results = [];
  let sort = 10;

  for (const article of ARTICLES) {
    process.stdout.write(`→ ${article.slug} ... `);
    try {
      let uploaded = null;
      let bytes = 0;
      let contentType = "image/webp";

      if (REUSE) {
        uploaded = await findExistingGallery(article.title, article.fileBase);
      }

      if (!uploaded) {
        const dest = path.join(TMP, `${article.fileBase}.webp`);
        // Prefer local cache from previous run
        let filePath = dest;
        if (!existsSync(dest) || readFileSync(dest).length < 5000) {
          const dl = await downloadFile(article.downloadUrl, dest);
          bytes = dl.bytes;
          contentType = dl.contentType;
          if (dl.bytes < 5000) {
            throw new Error(`Downloaded file too small (${dl.bytes} bytes)`);
          }
          if (contentType.includes("jpeg") || contentType.includes("jpg")) {
            const jpgPath = path.join(TMP, `${article.fileBase}.jpg`);
            writeFileSync(jpgPath, readFileSync(dest));
            filePath = jpgPath;
          } else if (contentType.includes("png")) {
            const pngPath = path.join(TMP, `${article.fileBase}.png`);
            writeFileSync(pngPath, readFileSync(dest));
            filePath = pngPath;
          }
        } else {
          bytes = readFileSync(dest).length;
          // Prefer jpg/png if webp is tiny placeholder
          for (const ext of [".jpg", ".png", ".webp"]) {
            const p = path.join(TMP, `${article.fileBase}${ext}`);
            if (existsSync(p) && readFileSync(p).length >= 5000) {
              filePath = p;
              bytes = readFileSync(p).length;
              break;
            }
          }
        }

        uploaded = await uploadGalleryCover({
          filePath,
          fileBase: article.fileBase,
          alt: article.alt,
          title: article.title,
          sort_order: sort,
        });
      }

      sort += 10;
      const art = await upsertArticle(table, article, uploaded.public_url);

      results.push({
        articleSlug: article.slug,
        articleTitle: article.title,
        articleAction: art.action,
        blogTable: table,
        sourceName: article.sourceName,
        sourcePage: article.sourcePage,
        photoId: article.photoId,
        originalDownloadUrl: article.downloadUrl,
        storage_path: uploaded.storage_path,
        public_url: uploaded.public_url,
        gallery_id: uploaded.id,
        reusedGallery: Boolean(uploaded.reused),
        bytes,
        contentType,
      });
      console.log(
        "OK",
        art.action,
        uploaded.reused ? "(reused gallery)" : uploaded.storage_path
      );
    } catch (e) {
      console.log("FAIL", e.message);
      results.push({
        articleSlug: article.slug,
        articleTitle: article.title,
        error: e.message,
        sourcePage: article.sourcePage,
        originalDownloadUrl: article.downloadUrl,
      });
    }
  }

  const outPath = path.join(TMP, "seed-report.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`Success: ${results.filter((r) => !r.error).length}/${results.length}`);

  console.log("\n## Summary\n");
  for (const r of results) {
    if (r.error) {
      console.log(`- FAIL **${r.articleSlug}**: ${r.error}`);
    } else {
      console.log(`- **${r.articleTitle}**`);
      console.log(`  - Source: ${r.sourceName} — ${r.sourcePage}`);
      console.log(`  - Photo: ${r.photoId}`);
      console.log(`  - Storage: \`${r.storage_path}\``);
      console.log(`  - Public URL: ${r.public_url}`);
      console.log(`  - Article: /blog/${r.articleSlug} (${r.articleAction} on ${r.blogTable})`);
    }
  }

  if (results.some((r) => r.error)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
