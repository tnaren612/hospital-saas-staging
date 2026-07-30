"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSessionProvider } from "@/components/admin/admin-session-context";

export function AdminLayoutClient({
  children,
  adminEmail,
  adminName,
  mode,
  role,
}: {
  children: React.ReactNode;
  adminEmail?: string | null;
  adminName?: string | null;
  mode?: "supabase" | "demo";
  role?: string | null;
}) {
  return (
    <AdminSessionProvider
      value={{
        role: role ?? "admin",
        mode: mode ?? "demo",
        email: adminEmail ?? null,
        name: adminName ?? null,
      }}
    >
      <AdminShell
        adminEmail={adminEmail}
        adminName={adminName}
        mode={mode}
        role={role}
      >
        {children}
      </AdminShell>
    </AdminSessionProvider>
  );
}
