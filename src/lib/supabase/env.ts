/**
 * Supabase environment helpers.
 * Safe to import from client or server.
 */

export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** True when public Supabase keys are present. */
export function hasSupabaseConfig(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(
    url &&
      key &&
      !url.includes("YOUR_PROJECT_REF") &&
      key !== "your_anon_key_here"
  );
}

/**
 * Prefer Supabase when configured AND flag is not explicitly false.
 * - NEXT_PUBLIC_USE_SUPABASE=true  → force Supabase (throws if misconfigured)
 * - NEXT_PUBLIC_USE_SUPABASE=false → force localStorage demo
 * - unset → auto: Supabase if keys exist, else localStorage
 */
/** Whether the app should use Supabase (not a React Hook). */
export function isSupabaseBackendEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_USE_SUPABASE;

  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return hasSupabaseConfig();

  return hasSupabaseConfig();
}

export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
