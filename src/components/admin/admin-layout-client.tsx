"use client";

import { AdminShell } from "@/components/admin/admin-shell";

export function AdminLayoutClient({
  children,
  adminEmail,
  adminName,
  mode,
}: {
  children: React.ReactNode;
  adminEmail?: string | null;
  adminName?: string | null;
  mode?: "supabase" | "demo";
}) {
  return (
    <AdminShell adminEmail={adminEmail} adminName={adminName} mode={mode}>
      {children}
    </AdminShell>
  );
}
