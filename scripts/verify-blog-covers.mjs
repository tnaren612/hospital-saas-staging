import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
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

const { data: articles, error } = await s
  .from("articles")
  .select("slug,title,cover_image,is_published")
  .order("published_at", { ascending: false });

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`Articles: ${articles.length}\n`);
let ok = 0;
for (const a of articles) {
  const url = a.cover_image || "";
  const isLocal = url.startsWith("/assets");
  const isPlaceholder = /placeholder|new-article/i.test(url);
  let http = "n/a";
  if (url.startsWith("http")) {
    try {
      const r = await fetch(url, { method: "HEAD" });
      http = String(r.status);
      if (r.ok) ok++;
    } catch (e) {
      http = e.message;
    }
  }
  console.log(
    `${a.slug}\n  cover: ${url}\n  local=${isLocal} placeholder=${isPlaceholder} http=${http}\n`
  );
}
console.log(`Reachable covers: ${ok}/${articles.length}`);
