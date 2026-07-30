import { redirect } from "next/navigation";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { cookies } from "next/headers";

/**
 * /admin — redirect hub
 * Authenticated admins → dashboard
 * Others → login
 */
export default async function AdminIndexPage() {
  if (isAdminAuthEnabled()) {
    const session = await getAdminSession();
    redirect(session ? "/admin/dashboard" : "/admin/login");
  }

  const demo = (await cookies()).get("ssh_admin_demo")?.value === "1";
  redirect(demo ? "/admin/dashboard" : "/admin/login");
}
