import type { Metadata } from "next";
import { Suspense } from "react";
import { PatientLoginContent } from "@/components/pages/patient-login-content";
import { createMetadata } from "@/lib/seo";
import { isSupabaseBackendEnabled, hasSupabaseConfig } from "@/lib/supabase/env";

export const metadata: Metadata = createMetadata({
  title: "Patient Login",
  description:
    "Secure patient portal login — email authentication and account recovery.",
  path: "/patient/login",
  noIndex: true,
});

export default function PatientLoginPage() {
  const supabaseEnabled =
    isSupabaseBackendEnabled() && hasSupabaseConfig();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
          Loading sign-in…
        </div>
      }
    >
      <PatientLoginContent supabaseEnabled={supabaseEnabled} />
    </Suspense>
  );
}
