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

for (const t of ["blog_articles", "articles", "gallery_images"]) {
  const r = await s.from(t).select("*").limit(1);
  console.log(t + ":", r.error ? r.error.message : "OK");
}

const g = await s
  .from("gallery_images")
  .select("id,section,key,storage_path,image_url,title")
  .eq("section", "blog")
  .order("created_at", { ascending: false })
  .limit(20);
console.log("blog gallery rows:", g.error?.message || g.data?.length);
console.log(JSON.stringify(g.data, null, 2));

// Try rpc exec if available
const rpc = await s.rpc("exec_sql", { query: "select 1" });
console.log("exec_sql rpc:", rpc.error?.message || rpc.data);
