"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const FloatingActions = dynamic(
  () =>
    import("@/components/floating/floating-actions").then(
      (m) => m.FloatingActions
    ),
  { ssr: false }
);

const AiChatbot = dynamic(
  () => import("@/components/chatbot/ai-chatbot").then((m) => m.AiChatbot),
  { ssr: false }
);

/**
 * Deferred non-critical chrome — load after first paint / idle
 * so appointment & marketing pages stay interactive sooner.
 */
export function ClientWidgets() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (
        window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(enable, { timeout: 2500 });
      return () => {
        cancelled = true;
        (
          window as Window & {
            cancelIdleCallback?: (id: number) => void;
          }
        ).cancelIdleCallback?.(id);
      };
    }

    const t = globalThis.setTimeout(enable, 1200);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(t);
    };
  }, []);

  if (!ready) return null;

  return (
    <>
      <FloatingActions />
      <AiChatbot />
    </>
  );
}
