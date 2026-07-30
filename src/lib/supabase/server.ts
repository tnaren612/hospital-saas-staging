/**
 * Server Supabase clients (Step 1).
 * Use in Server Components, Route Handlers, and Server Actions.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

/** Cookie-aware client (respects user session + RLS). */
export async function createServerSupabaseClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured on the server.");
  }

  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — safe to ignore if middleware refreshes sessions.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS.
 * ONLY use in trusted server code (admin jobs, webhooks).
 * Never import this into client components.
 */
export function createServiceRoleClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key || key === "your_service_role_key_here") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local / Vercel env."
    );
  }

  // Untyped service client avoids Insert inference issues with custom Database maps
  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** RLS-respecting server client authenticated with a browser access token. */
export function createTokenSupabaseClient(accessToken: string) {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured on the server.");
  }
  return createSupabaseClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** Non-persistent server client for credential authentication endpoints. */
export function createServerAuthClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured on the server.");
  }
  return createSupabaseClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
