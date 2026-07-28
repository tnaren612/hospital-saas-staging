/**
 * Ensure a blog table exists for the CMS.
 * Prefer public.blog_articles (migration 006). Fall back to public.articles (001).
 *
 * We cannot run DDL via the JS client without a DB password.
 * This script reports status and sets process for seed to use the live table.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  let k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  process.env[k] = v;
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function tableOk(name) {
  const { error } = await s.from(name).select("id").limit(1);
  return !error;
}

const prefer = "blog_articles";
const fallback = "articles";

let table = prefer;
if (await tableOk(prefer)) {
  console.log(`Using table: ${prefer}`);
} else if (await tableOk(fallback)) {
  table = fallback;
  console.log(
    `blog_articles missing — using legacy table: ${fallback}\n` +
      `Run supabase/migrations/006_blog_articles.sql in SQL Editor to create blog_articles,\n` +
      `then re-run seed. Until then, app code will target articles.`
  );
} else {
  console.error("Neither blog_articles nor articles exists. Run migrations 001 and 006.");
  process.exit(1);
}

const out = path.join(ROOT, ".tmp", "blog-table.json");
writeFileSync(out, JSON.stringify({ table }, null, 2));
console.log("Wrote", out);
