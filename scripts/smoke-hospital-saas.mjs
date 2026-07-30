/**
 * Deploy smoke: migration 025 presence, default hospital seed, host-map resolve, public config.
 * Usage: node scripts/smoke-hospital-saas.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function parseHostMap(raw) {
  const map = {};
  if (!raw) return map;
  for (const part of String(raw).split(",")) {
    const [host, slug] = part.split(":").map((s) => s.trim().toLowerCase());
    if (host && slug) map[host] = slug;
  }
  return map;
}

function resolveSlug({ host, cookieSlug, querySlug, hostMap, defaultSlug }) {
  if (querySlug && /^[a-z0-9][a-z0-9-]{0,62}$/.test(querySlug)) return querySlug;
  if (cookieSlug && /^[a-z0-9][a-z0-9-]{0,62}$/.test(cookieSlug)) return cookieSlug;
  const h = (host || "").split(":")[0].toLowerCase();
  const map = parseHostMap(hostMap);
  if (map[h]) return map[h];
  return defaultSlug || "default";
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const defaultSlug = (
  env.NEXT_PUBLIC_HOSPITAL_SLUG ||
  env.HOSPITAL_SLUG ||
  "default"
).toLowerCase();
const hostMap =
  env.HOSPITAL_HOST_MAP ||
  "sri-srinivasa-hospital.vercel.app:default,localhost:default";

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("=== Hospital SaaS smoke ===\n");

// 1) Host map unit
const slugLocal = resolveSlug({
  host: "localhost:3000",
  hostMap,
  defaultSlug,
});
const slugVercel = resolveSlug({
  host: "sri-srinivasa-hospital.vercel.app",
  hostMap,
  defaultSlug,
});
if (slugLocal === "default" || slugLocal === defaultSlug) {
  pass("host map localhost", `→ ${slugLocal}`);
} else {
  fail("host map localhost", `got ${slugLocal}`);
}
if (slugVercel === "default" || slugVercel === defaultSlug) {
  pass("host map vercel", `→ ${slugVercel}`);
} else {
  fail("host map vercel", `got ${slugVercel}`);
}

// 2) Supabase connectivity + migration 025
if (!url || !service) {
  fail("supabase env", "missing URL or service role key");
} else {
  const sb = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: hospitals, error: hErr } = await sb
    .from("hospitals")
    .select("id, slug, name, status")
    .limit(5);

  if (hErr) {
    if (/schema cache|does not exist|Could not find the table/i.test(hErr.message)) {
      fail(
        "migration 025",
        "hospitals table missing — apply 025_multi_hospital_saas_settings.sql in Supabase SQL Editor"
      );
      console.log("\n--- SQL to run (migration 025) ---");
      console.log(
        fs.readFileSync(
          path.join(root, "supabase/migrations/025_multi_hospital_saas_settings.sql"),
          "utf8"
        ).slice(0, 500) + "\n... (full file in supabase/migrations/025_...)\n"
      );
    } else {
      fail("hospitals select", hErr.message);
    }
  } else {
    pass("migration 025", `hospitals readable (${hospitals?.length ?? 0} rows)`);

    // Seed default hospital if empty
    let hospitalId = hospitals?.find((h) => h.slug === defaultSlug)?.id;
    if (!hospitalId) {
      const { data: created, error: cErr } = await sb
        .from("hospitals")
        .insert({
          slug: defaultSlug,
          name:
            env.NEXT_PUBLIC_HOSPITAL_NAME || "Sri Srinivasa Hospital",
          hospital_type: "multi_specialty",
          status: "active",
        })
        .select("id, slug, name")
        .single();
      if (cErr) {
        // maybe race / unique
        const { data: again } = await sb
          .from("hospitals")
          .select("id, slug, name")
          .eq("slug", defaultSlug)
          .maybeSingle();
        if (again) {
          hospitalId = again.id;
          pass("seed hospital", `${again.slug} already existed`);
        } else {
          fail("seed hospital", cErr.message);
        }
      } else {
        hospitalId = created.id;
        pass("seed hospital", `${created.slug} created`);
      }
    } else {
      pass("seed hospital", `${defaultSlug} present`);
    }

    if (hospitalId) {
      const { data: settings, error: sErr } = await sb
        .from("hospital_settings")
        .select("hospital_id, branding, modules, updated_at")
        .eq("hospital_id", hospitalId)
        .maybeSingle();

      if (sErr) {
        fail("hospital_settings", sErr.message);
      } else if (!settings) {
        const branding = {
          name: env.NEXT_PUBLIC_HOSPITAL_NAME || "Sri Srinivasa Hospital",
          tagline: "Excellence in Care",
          logo_url: "/icons/icon-192.svg",
          favicon_url: "/favicon.ico",
          banner_url: "",
          primary_color: "#1a5ff5",
          secondary_color: "#0d9488",
          theme: "default",
          dark_mode_default: false,
          watermark_url: "",
          digital_signature_url: "",
          loading_logo_url: "",
        };
        const { error: insErr } = await sb.from("hospital_settings").insert({
          hospital_id: hospitalId,
          branding,
          contact: {},
          localization: {},
          legal: {},
          modules: { appointments: true, laboratory: true, pharmacy: true },
          prefixes: {},
          payments: {},
          email: {},
          storage: {},
          auth_providers: {},
          templates: {},
          seo: {},
          social: {},
          working_hours: {},
        });
        if (insErr) fail("seed settings", insErr.message);
        else pass("seed settings", "default branding row created");
      } else {
        const name = settings.branding?.name || "(no name in branding)";
        pass("hospital_settings", `branding.name=${name}`);
      }
    }
  }
}

// 3) Summary
const failed = results.filter((r) => !r.ok);
console.log("\n=== Summary ===");
console.log(`passed ${results.filter((r) => r.ok).length}/${results.length}`);
console.log(`HOSPITAL_HOST_MAP=${hostMap}`);
console.log(`default slug=${defaultSlug}`);
if (failed.length) {
  console.log("\nACTION REQUIRED:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exitCode = 1;
} else {
  console.log("\nSmoke OK — migration 025 + host map ready.");
}
