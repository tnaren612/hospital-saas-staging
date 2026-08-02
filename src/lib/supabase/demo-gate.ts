/**
 * Demo fallback gate (security hardening — audit item 8).
 *
 * The in-memory / localStorage demo stores are development conveniences.
 * In a production build the app must NEVER silently serve demo data or
 * swallow database errors, so any attempt to reach a demo store throws
 * instead of fabricating data.
 *
 * Safe to import from client or server (NODE_ENV is inlined at build time;
 * NEXT_PUBLIC_ALLOW_DEMO_FALLBACK must keep the NEXT_PUBLIC_ prefix).
 */

export function allowDemoFallback(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.NEXT_PUBLIC_ALLOW_DEMO_FALLBACK === "false") return false;
  return true;
}

export function demoFallbackError(what: string): Error {
  return new Error(
    `[demo-fallback-disabled] ${what}: demo/local fallback is disabled in this environment. ` +
      "Configure Supabase (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, " +
      "NEXT_PUBLIC_USE_SUPABASE=true) or run outside production."
  );
}

/** Throw when demo fallbacks are not allowed (production / explicit opt-out). */
export function ensureDemoAllowed(what: string): void {
  if (!allowDemoFallback()) throw demoFallbackError(what);
}

/**
 * Wrap a demo store so any method access throws when demo fallbacks are
 * disabled — a single guard point for in-memory demo stores.
 */
export function gatedDemoStore<T extends object>(what: string, store: T): T {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") ensureDemoAllowed(what);
      return value;
    },
  });
}
