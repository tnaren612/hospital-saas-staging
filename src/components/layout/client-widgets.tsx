"use client";

import dynamic from "next/dynamic";

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

/** Deferred non-critical chrome for smaller initial JS. */
export function ClientWidgets() {
  return (
    <>
      <FloatingActions />
      <AiChatbot />
    </>
  );
}
