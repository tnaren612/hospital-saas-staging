import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import { AdminSettings } from "@/components/admin/admin-settings";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";

export const metadata: Metadata = createMetadata({
  title: "Admin Settings",
  path: "/admin/settings",
  noIndex: true,
});

export default async function AdminSettingsPage() {
  let email: string | null = null;
  let name: string | null = null;
  let role: string | null = null;
  let userId: string | null = null;

  if (isAdminAuthEnabled()) {
    const session = await getAdminSession();
    email = session?.profile.email || session?.user.email || null;
    name = session?.profile.full_name || null;
    role = session?.profile.role || null;
    userId = session?.user.id || null;
  } else {
    email = "demo@local";
    name = "Demo Admin";
    role = "admin";
    userId = "demo";
  }

  return (
    <AdminSettings
      email={email}
      name={name}
      role={role}
      userId={userId}
      authMode={isAdminAuthEnabled() ? "supabase" : "demo"}
    />
  );
}
