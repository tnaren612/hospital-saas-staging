/**
 * Apply multi-hospital migration 025 using Supabase REST is not possible for DDL.
 * This script tries the service-role client for seed; for DDL it prints instructions
 * and optionally uses DATABASE_URL with `pg` if installed.
 *
 * Prefer: paste supabase/migrations/025_multi_hospital_saas_settings.sql
 * into Supabase Dashboard → SQL Editor → Run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sqlPath = path.join(
  root,
  "supabase/migrations/025_multi_hospital_saas_settings.sql"
);

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl =
  env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";

const sql = fs.readFileSync(sqlPath, "utf8");

async function tryPg() {
  if (!dbUrl) return false;
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("✓ Applied 025 via DATABASE_URL (pg)");
    return true;
  } catch (e) {
    console.warn("pg apply failed:", e.message);
    return false;
  }
}

async function checkTables() {
  const sb = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.from("hospitals").select("id").limit(1);
  if (!error) {
    console.log("✓ hospitals table already exists");
    return true;
  }
  console.log("tables missing:", error.message);
  return false;
}

if (!url || !service) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const exists = await checkTables();
if (exists) {
  process.exit(0);
}

const applied = await tryPg();
if (applied) {
  process.exit(0);
}

console.error(`
Could not apply DDL automatically (no DATABASE_URL / pg).

Run this now:
1. Open https://supabase.com/dashboard/project/wybiwhcymedoljgwehrc/sql/new
2. Paste contents of:
   supabase/migrations/025_multi_hospital_saas_settings.sql
3. Click Run
4. Re-run: node scripts/smoke-hospital-saas.mjs
`);
// Copy SQL to a one-shot file for easy open
const out = path.join(root, "scripts", "_025_to_run.sql");
fs.writeFileSync(out, sql);
console.log("SQL copied to", out);
process.exit(2);
