import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

try {
  loadLocalEnv(await readFile(".env.local", "utf8"));
} catch {
  // CI may supply variables directly.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  throw new Error("Supabase URL and service role are required");
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const roleUsers = [
  ["receptionist", "reception1@test.com", "E2E Receptionist"],
  ["billing", "billing1@test.com", "E2E Billing"],
  ["finance", "finance1@test.com", "E2E Finance"],
  ["hr", "hr1@test.com", "E2E HR"],
  ["manager", "manager1@test.com", "E2E Manager"],
];

const { data: adminProfile, error: adminProfileError } = await supabase
  .from("profiles")
  .select("id,hospital_id")
  .eq("email", "admin2@test.com")
  .single();
if (adminProfileError || !adminProfile) {
  throw new Error("admin2@test.com must have a profile before seeding users");
}

let hospitalId = adminProfile.hospital_id;
if (!hospitalId) {
  const configuredSlug =
    process.env.NEXT_PUBLIC_HOSPITAL_SLUG || process.env.HOSPITAL_SLUG;
  if (!configuredSlug) {
    throw new Error(
      "Admin has no hospital_id and no configured hospital slug is available"
    );
  }
  const { data: hospital, error: hospitalError } = await supabase
    .from("hospitals")
    .select("id")
    .eq("slug", configuredSlug.toLowerCase())
    .eq("status", "active")
    .single();
  if (hospitalError || !hospital) {
    throw new Error("Configured active hospital was not found");
  }
  hospitalId = hospital.id;
  const { error: repairError } = await supabase
    .from("profiles")
    .update({ hospital_id: hospitalId })
    .eq("id", adminProfile.id);
  if (repairError) throw repairError;
}

const { data: listed, error: listError } =
  await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

const credentials = {};
for (const [role, email, fullName] of roleUsers) {
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  let user = listed.users.find(
    (candidate) => candidate.email?.toLowerCase() === email
  );

  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role,
      hospital_id: hospitalId,
    },
    { onConflict: "id" }
  );
  if (profileError) throw profileError;

  credentials[role] = { email, password };
}

await mkdir(".tmp", { recursive: true });
await writeFile(
  ".tmp/e2e-role-credentials.json",
  `${JSON.stringify(credentials, null, 2)}\n`,
  { mode: 0o600 }
);

process.stdout.write(
  `Provisioned ${roleUsers.length} tenant-scoped E2E role users; credentials saved to ignored .tmp storage.\n`
);
