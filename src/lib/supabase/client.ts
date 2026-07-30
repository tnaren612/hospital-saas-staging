/**
 * Browser Supabase client (Step 1).
 * Use in Client Components only.
 */

import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  browserClient ??= createBrowserClient(
    getSupabaseUrl()!,
    getSupabaseAnonKey()!
  );
  return browserClient;
}

/** Returns null when Supabase env is missing (demo/localStorage mode). */
export function createClientOrNull() {
  if (!hasSupabaseConfig()) return null;
  return createClient();
}
