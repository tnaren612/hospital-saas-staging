import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { cookies } from "next/headers";

/**
 * Layout for authenticated admin pages.
 * Middleware already enforces auth; this hydrates shell identity.
 */
export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let email: string | null = null;
  let name: string | null = null;
  let mode: "supabase" | "demo" = "demo";
  let role: string | null = "admin";

  if (isAdminAuthEnabled()) {
    const session = await getAdminSession();
    email = session?.profile.email || session?.user.email || null;
    name = session?.profile.full_name || null;
    role = session?.profile.role || "admin";
    mode = "supabase";
  } else if ((await cookies()).get("ssh_admin_demo")?.value === "1") {
    email = "demo@local";
    name = "Demo Admin";
    role = "admin";
    mode = "demo";
  }

  return (
    <AdminLayoutClient
      adminEmail={email}
      adminName={name}
      mode={mode}
      role={role}
    >
      {children}
    </AdminLayoutClient>
  );
}
