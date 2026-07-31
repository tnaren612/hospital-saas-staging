import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import { DataManagementManager } from "@/components/admin/datahub/data-management-manager";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";

export const metadata: Metadata = createMetadata({
  title: "Data Management",
  path: "/admin/data-management",
  noIndex: true,
});

export default async function DataManagementPage() {
  let email: string | null = null;
  let userId: string | null = null;

  if (isAdminAuthEnabled()) {
    const session = await getAdminSession();
    email = session?.profile.email || session?.user.email || null;
    userId = session?.user.id || null;
  } else {
    email = "demo@local";
    userId = "demo";
  }

  return <DataManagementManager email={email} userId={userId} />;
}
